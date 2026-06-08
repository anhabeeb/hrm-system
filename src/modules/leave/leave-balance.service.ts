import type {
  LeaveBalanceRecord,
  LeaveBalanceTransactionRecord,
  LeaveBalanceTransactionType,
  LeaveEmployeeRecord,
  LeavePolicyRecord,
  LeaveRequestRecord,
  LeaveTypeRecord,
} from "./leave.types";
import * as repository from "./leave.repository";
import { AppError, ConflictError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
const roundDays = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

const entitlementDaysFor = (leaveType: LeaveTypeRecord | null | undefined, policy: LeavePolicyRecord | null | undefined) =>
  Number(policy?.entitlement_days ?? leaveType?.annual_entitlement_days ?? leaveType?.default_days ?? 0);

const initialAccruedDaysFor = (leaveType: LeaveTypeRecord | null | undefined, policy: LeavePolicyRecord | null | undefined) => {
  // Accrual-enabled leave must earn entitlement through ledgered accrual transactions.
  if ((leaveType?.accrual_enabled ?? 0) === 1) return 0;
  return entitlementDaysFor(leaveType, policy);
};

export const availableDays = (balance: LeaveBalanceRecord) =>
  roundDays(
    (balance.opening_balance ?? 0)
    + (balance.accrued_days ?? 0)
    + (balance.adjusted_days ?? 0)
    + (balance.carried_forward_days ?? 0)
    - (balance.used_days ?? 0)
    - (balance.pending_days ?? 0)
    - (balance.expired_days ?? 0),
  );

export const normalizeBalance = (balance: LeaveBalanceRecord): LeaveBalanceRecord => {
  const available = availableDays(balance);
  return {
    ...balance,
    pending_days: balance.pending_days ?? 0,
    adjusted_days: balance.adjusted_days ?? 0,
    carried_forward_days: balance.carried_forward_days ?? 0,
    expired_days: balance.expired_days ?? 0,
    entitlement_days: balance.entitlement_days ?? balance.opening_balance + balance.accrued_days,
    policy_year: balance.policy_year ?? balance.year,
    accrual_period_start: balance.accrual_period_start ?? `${balance.year}-01-01`,
    accrual_period_end: balance.accrual_period_end ?? `${balance.year}-12-31`,
    status: balance.status ?? "active",
    available_days: available,
    remaining_days: available,
    created_at: balance.created_at ?? balance.updated_at ?? nowIso(),
    updated_at: balance.updated_at ?? nowIso(),
  };
};

export const initializeBalanceIfNeeded = async (
  env: Env,
  companyId: string,
  employee: LeaveEmployeeRecord,
  leaveTypeId: string,
  year: number,
  policy: LeavePolicyRecord | null,
  leaveType?: LeaveTypeRecord | null,
): Promise<LeaveBalanceRecord> => {
  const existing = await repository.findBalance(env, companyId, employee.id, leaveTypeId, year);
  if (existing) return normalizeBalance(existing);

  const entitlement = entitlementDaysFor(leaveType, policy);
  const accruedDays = initialAccruedDaysFor(leaveType, policy);
  const balance = normalizeBalance({
    id: createPrefixedId("leave_balance"),
    company_id: companyId,
    employee_id: employee.id,
    leave_type_id: leaveTypeId,
    year,
    opening_balance: 0,
    accrued_days: accruedDays,
    used_days: 0,
    pending_days: 0,
    adjusted_days: 0,
    carried_forward_days: 0,
    expired_days: 0,
    entitlement_days: entitlement,
    remaining_days: accruedDays,
    updated_at: nowIso(),
  });
  await repository.upsertBalance(env, balance);
  return balance;
};

const maxNegativeLimit = (leaveType: LeaveTypeRecord, policy: LeavePolicyRecord | null) => {
  if ((leaveType.allow_negative_balance ?? policy?.allow_negative_balance ?? 0) !== 1) return 0;
  return Math.abs(Number(leaveType.max_negative_balance ?? 0));
};

export const assertBalanceFloor = (
  balance: LeaveBalanceRecord,
  nextAvailable: number,
  leaveType: LeaveTypeRecord,
  policy: LeavePolicyRecord | null,
) => {
  const limit = maxNegativeLimit(leaveType, policy);
  if (nextAvailable < -limit) {
    throw new AppError(
      "Leave balance is not enough for this request.",
      limit > 0 ? "LEAVE_NEGATIVE_BALANCE_NOT_ALLOWED" : "LEAVE_BALANCE_INSUFFICIENT",
      409,
    );
  }
};

export const assertSufficientBalance = (
  balance: LeaveBalanceRecord,
  requestedDays: number,
  policy: LeavePolicyRecord | null,
  leaveType?: LeaveTypeRecord,
) => {
  const normalized = normalizeBalance(balance);
  const limit = leaveType ? maxNegativeLimit(leaveType, policy) : (policy?.allow_negative_balance === 1 ? Number.MAX_SAFE_INTEGER : 0);
  if ((normalized.available_days ?? normalized.remaining_days) - requestedDays < -limit) {
    throw new ConflictError("Leave balance is not enough for this request.");
  }
};

const transactionExists = async (env: Env, companyId: string, idempotencyKey?: string | null) =>
  idempotencyKey ? repository.findTransactionByIdempotencyKey(env, companyId, idempotencyKey) : null;

type BalanceTransactionInput = {
  balance: LeaveBalanceRecord;
  leaveType: LeaveTypeRecord;
  policy?: LeavePolicyRecord | null;
  type: LeaveBalanceTransactionType;
  quantityDays: number;
  effectiveDate: string;
  source: LeaveBalanceTransactionRecord["source"];
  reason?: string | null;
  leaveRequestId?: string | null;
  idempotencyKey?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
  mutate: (balance: LeaveBalanceRecord) => LeaveBalanceRecord;
};

const currentStoredBalance = async (env: Env, balance: LeaveBalanceRecord) => {
  const current = await repository.findBalance(env, balance.company_id, balance.employee_id, balance.leave_type_id, balance.year);
  return current ? normalizeBalance(current) : normalizeBalance(balance);
};

export const planBalanceTransaction = (
  input: {
    balance: LeaveBalanceRecord;
    leaveType: LeaveTypeRecord;
    policy?: LeavePolicyRecord | null;
    type: LeaveBalanceTransactionType;
    quantityDays: number;
    effectiveDate: string;
    source: LeaveBalanceTransactionRecord["source"];
    reason?: string | null;
    leaveRequestId?: string | null;
    idempotencyKey?: string | null;
    createdBy?: string | null;
    metadata?: Record<string, unknown>;
    mutate: (balance: LeaveBalanceRecord) => LeaveBalanceRecord;
  },
) => {
  const before = availableDays(input.balance);
  const next = normalizeBalance({
    ...input.mutate(normalizeBalance(input.balance)),
    updated_at: nowIso(),
  });
  assertBalanceFloor(next, next.available_days ?? next.remaining_days, input.leaveType, input.policy ?? null);
  const transaction: LeaveBalanceTransactionRecord = {
    id: createPrefixedId("leave_tx"),
    company_id: next.company_id,
    employee_id: next.employee_id,
    leave_type_id: next.leave_type_id,
    balance_id: next.id,
    leave_request_id: input.leaveRequestId ?? null,
    transaction_type: input.type,
    quantity_days: roundDays(input.quantityDays),
    balance_before: before,
    balance_after: next.available_days ?? next.remaining_days,
    effective_date: input.effectiveDate,
    reason: input.reason ?? null,
    source: input.source,
    idempotency_key: input.idempotencyKey ?? null,
    created_by: input.createdBy ?? null,
    created_at: nowIso(),
    metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
  };
  return { transaction, balance: next };
};

export const recordBalanceTransaction = async (
  env: Env,
  input: BalanceTransactionInput,
) => {
  const existingTransaction = await transactionExists(env, input.balance.company_id, input.idempotencyKey);
  if (existingTransaction) {
    return { applied: false, transaction: existingTransaction, balance: await currentStoredBalance(env, input.balance) };
  }

  const planned = planBalanceTransaction(input);
  try {
    await repository.createBalanceTransactionAndUpdateBalance(env, planned.transaction, planned.balance);
  } catch (error) {
    const existingAfterConflict = await transactionExists(env, input.balance.company_id, input.idempotencyKey);
    if (existingAfterConflict) {
      return { applied: false, transaction: existingAfterConflict, balance: await currentStoredBalance(env, input.balance) };
    }
    throw error;
  }
  return { applied: true, transaction: planned.transaction, balance: planned.balance };
};

export const setOpeningBalance = async (
  env: Env,
  input: {
    balance: LeaveBalanceRecord;
    leaveType: LeaveTypeRecord;
    policy?: LeavePolicyRecord | null;
    openingBalance: number;
    reason: string;
    effectiveDate: string;
    actorId: string;
  },
) => {
  if (!input.reason?.trim()) throw new ValidationError("A reason is required for this action.");
  const idempotencyKey = `opening:${input.balance.employee_id}:${input.balance.leave_type_id}:${input.balance.year}:${input.openingBalance}`;
  return recordBalanceTransaction(env, {
    balance: input.balance,
    leaveType: input.leaveType,
    policy: input.policy,
    type: "opening_balance",
    quantityDays: roundDays(input.openingBalance - input.balance.opening_balance),
    effectiveDate: input.effectiveDate,
    source: "manual_adjustment",
    reason: input.reason,
    idempotencyKey,
    createdBy: input.actorId,
    mutate: (balance) => ({ ...balance, opening_balance: input.openingBalance }),
  });
};

export const addManualAdjustment = async (
  env: Env,
  input: {
    balance: LeaveBalanceRecord;
    leaveType: LeaveTypeRecord;
    policy?: LeavePolicyRecord | null;
    adjustmentDays: number;
    reason: string;
    effectiveDate: string;
    actorId: string;
  },
) => {
  if (!input.reason?.trim()) throw new ValidationError("A reason is required for this action.");
  return recordBalanceTransaction(env, {
    balance: input.balance,
    leaveType: input.leaveType,
    policy: input.policy,
    type: "manual_adjustment",
    quantityDays: input.adjustmentDays,
    effectiveDate: input.effectiveDate,
    source: "manual_adjustment",
    reason: input.reason,
    createdBy: input.actorId,
    mutate: (balance) => ({ ...balance, adjusted_days: (balance.adjusted_days ?? 0) + input.adjustmentDays }),
  });
};

export const reserveRequestBalance = async (
  env: Env,
  balance: LeaveBalanceRecord,
  leaveType: LeaveTypeRecord,
  policy: LeavePolicyRecord | null,
  request: LeaveRequestRecord,
  actorId: string | null,
  idempotencyKey = `leave_request:${request.id}:reserved`,
) => recordBalanceTransaction(env, {
  balance,
  leaveType,
  policy,
  type: "request_reserved",
  quantityDays: request.total_days,
  effectiveDate: request.start_date,
  source: "leave_request",
  reason: request.reason,
  leaveRequestId: request.id,
  idempotencyKey,
  createdBy: actorId,
  mutate: (current) => ({ ...current, pending_days: (current.pending_days ?? 0) + request.total_days }),
});

export const releaseRequestBalance = async (
  env: Env,
  balance: LeaveBalanceRecord,
  leaveType: LeaveTypeRecord,
  policy: LeavePolicyRecord | null,
  request: LeaveRequestRecord,
  actorId: string | null,
  reason: string,
  idempotencyKey = `leave_request:${request.id}:released`,
) => recordBalanceTransaction(env, {
  balance,
  leaveType,
  policy,
  type: "request_released",
  quantityDays: request.total_days,
  effectiveDate: request.start_date,
  source: "leave_request",
  reason,
  leaveRequestId: request.id,
  idempotencyKey,
  createdBy: actorId,
  mutate: (current) => ({ ...current, pending_days: Math.max(0, (current.pending_days ?? 0) - request.total_days) }),
});

export const useRequestBalance = async (
  env: Env,
  balance: LeaveBalanceRecord,
  leaveType: LeaveTypeRecord,
  policy: LeavePolicyRecord | null,
  request: LeaveRequestRecord,
  actorId: string | null,
  reason: string,
  idempotencyKey = `leave_request:${request.id}:used`,
) => recordBalanceTransaction(env, {
  balance,
  leaveType,
  policy,
  type: "leave_used",
  quantityDays: -request.total_days,
  effectiveDate: request.start_date,
  source: "leave_request",
  reason,
  leaveRequestId: request.id,
  idempotencyKey,
  createdBy: actorId,
  mutate: (current) => ({
    ...current,
    pending_days: Math.max(0, (current.pending_days ?? 0) - request.total_days),
    used_days: current.used_days + request.total_days,
  }),
});

export const applyAccrual = async (
  env: Env,
  input: {
    balance: LeaveBalanceRecord;
    leaveType: LeaveTypeRecord;
    policy?: LeavePolicyRecord | null;
    amount: number;
    periodKey: string;
    effectiveDate: string;
    actorId?: string | null;
  },
) => recordBalanceTransaction(env, {
  balance: input.balance,
  leaveType: input.leaveType,
  policy: input.policy,
  type: "accrual",
  quantityDays: input.amount,
  effectiveDate: input.effectiveDate,
  source: "accrual_job",
  reason: `Leave accrual for ${input.periodKey}`,
  idempotencyKey: `accrual:${input.balance.employee_id}:${input.balance.leave_type_id}:${input.periodKey}`,
  createdBy: input.actorId ?? null,
  metadata: { period_key: input.periodKey },
  mutate: (current) => ({
    ...current,
    accrued_days: current.accrued_days + input.amount,
    last_accrual_date: input.effectiveDate,
  }),
});

export const applyCarryForward = async (
  env: Env,
  input: {
    sourceBalance: LeaveBalanceRecord;
    destinationBalance: LeaveBalanceRecord;
    leaveType: LeaveTypeRecord;
    policy?: LeavePolicyRecord | null;
    amount: number;
    sourceYear: number;
    destinationYear: number;
    reason: string;
    actorId: string;
  },
) => recordBalanceTransaction(env, {
  balance: input.destinationBalance,
  leaveType: input.leaveType,
  policy: input.policy,
  type: "carry_forward",
  quantityDays: input.amount,
  effectiveDate: `${input.destinationYear}-01-01`,
  source: "system",
  reason: input.reason,
  idempotencyKey: `carry_forward:${input.destinationBalance.employee_id}:${input.destinationBalance.leave_type_id}:${input.sourceYear}:${input.destinationYear}`,
  createdBy: input.actorId,
  metadata: { source_balance_id: input.sourceBalance.id, source_year: input.sourceYear },
  mutate: (current) => ({ ...current, carried_forward_days: (current.carried_forward_days ?? 0) + input.amount }),
});

export const applyExpiry = async (
  env: Env,
  input: {
    balance: LeaveBalanceRecord;
    leaveType: LeaveTypeRecord;
    policy?: LeavePolicyRecord | null;
    amount: number;
    effectiveDate: string;
    reason: string;
    actorId: string;
  },
) => recordBalanceTransaction(env, {
  balance: input.balance,
  leaveType: input.leaveType,
  policy: input.policy,
  type: "expiry",
  quantityDays: -input.amount,
  effectiveDate: input.effectiveDate,
  source: "system",
  reason: input.reason,
  idempotencyKey: `expiry:${input.balance.employee_id}:${input.balance.leave_type_id}:${input.effectiveDate}:${input.amount}`,
  createdBy: input.actorId,
  mutate: (current) => ({ ...current, expired_days: (current.expired_days ?? 0) + input.amount }),
});

// Backward-compatible wrappers used by older leave service paths.
export const deductBalance = async (env: Env, balance: LeaveBalanceRecord, days: number) => {
  const normalized = normalizeBalance(balance);
  await repository.upsertBalance(env, normalizeBalance({
    ...normalized,
    used_days: normalized.used_days + days,
  }));
};

export const restoreBalance = async (env: Env, balance: LeaveBalanceRecord, days: number) => {
  const normalized = normalizeBalance(balance);
  await repository.upsertBalance(env, normalizeBalance({
    ...normalized,
    used_days: Math.max(0, normalized.used_days - days),
  }));
};
