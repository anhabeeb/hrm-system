import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  console.error(`Leave balance verification failed: ${message}`);
  process.exit(1);
};

const migration = read("migrations/0037_leave_balance_accrual_hardening.sql");
const routes = read("src/routes/leave.routes.ts");
const service = read("src/modules/leave/leave.service.ts");
const balanceService = read("src/modules/leave/leave-balance.service.ts");
const accrualService = read("src/modules/leave/leave-accrual.service.ts");
const repository = read("src/modules/leave/leave.repository.ts");
const permissions = read("seeds/permissions.seed.sql");
const leavePage = read("frontend/src/features/leave/LeavePage.tsx");
const balancesTable = read("frontend/src/features/leave/LeaveBalancesTable.tsx");
const balanceActionDialog = read("frontend/src/features/leave/LeaveBalanceActionDialog.tsx");
const leaveTypesPanel = read("frontend/src/features/leave/LeaveTypesPanel.tsx");
const leaveTypeSettingsDialog = read("frontend/src/features/leave/LeaveTypeSettingsDialog.tsx");
const tests = read("tests/leave-balances.test.ts") + read("tests/leave-accrual.test.ts") + read("tests/leave.test.ts");

for (const column of [
  "pending_days",
  "adjusted_days",
  "carried_forward_days",
  "expired_days",
  "available_days",
  "entitlement_days",
  "last_accrual_date",
  "next_accrual_date",
]) {
  if (!migration.includes(column)) fail(`leave_balances missing ${column}`);
}

for (const token of [
  "CREATE TABLE IF NOT EXISTS leave_balance_transactions",
  "idempotency_key",
  "idx_leave_balance_tx_company_idempotency",
]) {
  if (!migration.includes(token)) fail(`transaction ledger/idempotency missing ${token}`);
}

for (const route of [
  '"/balances/opening"',
  '"/balances/adjust"',
  '"/balances/:employeeId/transactions"',
  '"/accrual/preview"',
  '"/accrual/apply"',
]) {
  if (!routes.includes(route)) fail(`missing leave balance route ${route}`);
}

for (const permission of [
  "leave.balances.view",
  "leave.balances.manage",
  "leave.balances.adjust",
  "leave.accrual.preview",
  "leave.accrual.apply",
  "leave.transactions.view",
]) {
  if (!routes.includes(permission)) fail(`route does not enforce ${permission}`);
  if (!permissions.includes(permission)) fail(`permission ${permission} is not seeded`);
}

for (const token of [
  "recordBalanceTransaction",
  "findTransactionByIdempotencyKey",
  "request_reserved",
  "request_released",
  "leave_used",
  "manual_adjustment",
  "carry_forward",
  "expiry",
]) {
  if (!balanceService.includes(token) && !service.includes(token) && !repository.includes(token)) {
    fail(`balance transaction behavior missing ${token}`);
  }
}

const recordBody = balanceService.slice(
  balanceService.indexOf("export const recordBalanceTransaction"),
  balanceService.indexOf("export const setOpeningBalance"),
);
if (!recordBody.includes("createBalanceTransactionAndUpdateBalance")) {
  fail("recordBalanceTransaction must use an atomic repository helper for ledger + aggregate updates");
}
if (recordBody.includes("await repository.createBalanceTransaction(env") || recordBody.includes("await repository.upsertBalance(env, next)")) {
  fail("recordBalanceTransaction writes transaction and aggregate outside the atomic batch helper");
}
if (!recordBody.includes("currentStoredBalance")) {
  fail("duplicate idempotency must return the current stored balance, not stale input balance");
}

const initBody = balanceService.slice(
  balanceService.indexOf("export const initializeBalanceIfNeeded"),
  balanceService.indexOf("const maxNegativeLimit"),
);
if (!initBody.includes("initialAccruedDaysFor") || initBody.includes("carried_forward_days: carryForward")) {
  fail("balance initialization must keep entitlement/carry-forward separate from earned ledger amounts");
}

for (const token of [
  "previewCompanyAccrual",
  "applyCompanyAccrual",
  "findTransactionByIdempotencyKey",
  "previewBalance",
]) {
  if (!accrualService.includes(token)) fail(`accrual service missing ${token}`);
}

const previewBody = accrualService.slice(
  accrualService.indexOf("export const previewCompanyAccrual"),
  accrualService.indexOf("export const applyCompanyAccrual"),
);
if (previewBody.includes("initializeBalanceIfNeeded") || previewBody.includes("upsertBalance") || previewBody.includes("createBalanceTransaction")) {
  fail("accrual preview appears to write balances");
}
if (previewBody.includes("carried_forward_days: carryForward") || previewBody.includes("accrued_days: entitlement")) {
  fail("accrual preview appears to pre-credit entitlement or carry-forward");
}

for (const token of [
  "createBalanceTransactionAndUpdateBalance",
  "createLeaveRequestWithBalanceTransaction",
  "updateLeaveRequestStatusWithBalanceTransaction",
  "updatePendingLeaveRequestWithRebalance",
  "env.DB.batch",
]) {
  if (!repository.includes(token)) fail(`repository atomic lifecycle helper missing ${token}`);
}

for (const token of [
  "createLeaveRequestWithBalanceTransaction",
  "updateLeaveRequestStatusWithBalanceTransaction",
  "updatePendingLeaveRequestWithRebalance",
  "planBalanceTransaction",
]) {
  if (!service.includes(token)) fail(`leave request lifecycle does not use atomic helper ${token}`);
}

for (const token of [
  "LeaveAccrualPanel",
  "LeaveBalanceActionDialog",
  "LeaveTypeSettingsDialog",
  "LeaveTransactionsDialog",
  'TabsTrigger value="accrual"',
  "View transactions",
  "Set opening balance",
  "Carry forward",
  "Expire leave",
  "Rebuild from ledger",
  "Adjusted",
  "Carried",
  "Expired",
]) {
  if (!leavePage.includes(token) && !balancesTable.includes(token) && !balanceActionDialog.includes(token) && !leaveTypesPanel.includes(token) && !leaveTypeSettingsDialog.includes(token)) fail(`frontend leave balance UI missing ${token}`);
}

for (const field of [
  "requires_balance",
  "allow_negative_balance",
  "max_negative_balance",
  "accrual_enabled",
  "accrual_frequency",
  "annual_entitlement_days",
  "accrual_amount",
  "prorate_on_joining",
  "prorate_on_termination",
  "carry_forward_enabled",
  "carry_forward_limit_days",
  "carry_forward_expiry_month",
  "carry_forward_expiry_day",
  "half_day_enabled",
  "sort_order",
]) {
  if (!leaveTypeSettingsDialog.includes(field)) fail(`frontend leave type Phase 9A edit field missing ${field}`);
}

for (const token of [
  "carryForwardBalance",
  "expireBalance",
  "rebuildBalance",
]) {
  if (!read("frontend/src/features/leave/leave.api.ts").includes(token)) fail(`frontend leave API missing ${token}`);
}

for (const forbidden of [
  'it.todo("approve leave updates balance"',
  'it.todo("reject leave does not update balance"',
  'it.todo("cancel approved leave restores balance"',
]) {
  if (read("tests/leave.test.ts").includes(forbidden)) {
    fail(`Phase 9A-critical TODO still present: ${forbidden}`);
  }
}

for (const requiredTestToken of [
  "opening balance creates an immutable transaction",
  "initializes accrual-enabled balances",
  "duplicate transaction batch failure does not mutate",
  "batches ledger insert and aggregate update together",
  "batches leave request creation with balance transaction",
  "manual adjustment requires a reason",
  "negative balance is blocked",
  "accrual preview does not write",
  "accrual run twice does not duplicate",
]) {
  if (!tests.includes(requiredTestToken)) fail(`missing real Phase 9A test: ${requiredTestToken}`);
}

console.log("Leave balance schema verification passed.");
