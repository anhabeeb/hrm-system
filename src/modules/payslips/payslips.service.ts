import { PAYSLIP_AUDIT_ACTIONS } from "./payslips.constants";
import * as repository from "./payslips.repository";
import type { PayslipFilters, PayslipGenerateInput, PayslipListResult } from "./payslips.types";
import * as payrollRepository from "../payroll/payroll.repository";
import { buildPayslipSnapshots, hasFullPayrollAccess } from "../payroll/payroll.service";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, OutletAccessError } from "../../utils/errors";

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({ page, page_size: pageSize, total, total_pages: total === 0 ? 0 : Math.ceil(total / pageSize) });
const ensureAudit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; newValue?: unknown; reason?: string }) => {
  const result = await createAuditLog(env, { companyId: context.companyId, module: "payslips", action: input.action, entityType: "payslip", entityId: input.entityId, actorId: context.actorUserId, newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue), reason: input.reason });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};
const bestEffortAudit = (env: Env, context: AuthActor, input: { action: string; entityId: string; newValue?: unknown; reason?: string }) =>
  ensureAudit(env, context, input).catch((error) => console.error("Payslip audit failed", error));

const parseJson = (value: unknown, fallback: unknown) => {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const money = (amount: unknown, currency = "MVR") => {
  const cents = Number(amount ?? 0);
  return `${currency} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const firstDefined = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null && value !== "");

export const sanitizePayslipForResponse = (payslip: any) => {
  const snapshot = parseJson(payslip.snapshot_json, {});
  const employee = parseJson(payslip.employee_snapshot_json, (snapshot as any).employee ?? {});
  const company = parseJson(payslip.company_snapshot_json, (snapshot as any).company ?? {});
  const payrollPeriod = parseJson(payslip.period_snapshot_json, (snapshot as any).payroll_period ?? {});
  const earnings = parseJson(payslip.earnings_json, (snapshot as any).earnings ?? []);
  const deductions = parseJson(payslip.deductions_json, (snapshot as any).deductions ?? []);
  const nonCashBenefits = parseJson(payslip.non_cash_benefits_json, (snapshot as any).non_cash_benefits ?? []);
  const totals = parseJson(payslip.totals_json, (snapshot as any).totals ?? (snapshot as any).amounts ?? {});
  const {
    file_key: _fileKey,
    storage_key: _storageKey,
    r2_key: _r2Key,
    object_key: _objectKey,
    private_storage_path: _privateStoragePath,
    signed_url: _signedUrl,
    token: _token,
    secret: _secret,
    api_token_hash: _apiTokenHash,
    device_token_hash: _deviceTokenHash,
    snapshot_json: _snapshotJson,
    employee_snapshot_json: _employeeSnapshotJson,
    company_snapshot_json: _companySnapshotJson,
    period_snapshot_json: _periodSnapshotJson,
    earnings_json: _earningsJson,
    deductions_json: _deductionsJson,
    non_cash_benefits_json: _nonCashBenefitsJson,
    totals_json: _totalsJson,
    ...safe
  } = payslip;
  return {
    ...safe,
    company,
    employee,
    payroll_period: payrollPeriod,
    earnings,
    deductions,
    non_cash_benefits: nonCashBenefits,
    totals,
    snapshot,
    download_url: `/api/v1/payslips/${payslip.id}/download`,
    print_url: `/api/v1/payslips/${payslip.id}/print`,
  };
};

const ensurePayslip = async (env: Env, context: AuthActor, id: string) => {
  const payslip = await repository.findPayslip(env, context.companyId, id);
  if (!payslip) throw new NotFoundError("Payslip could not be found.");
  if (!permissionService.hasOutletAccess(context, payslip.outlet_id)) {
    await bestEffortAudit(env, context, {
      action: PAYSLIP_AUDIT_ACTIONS.accessDenied,
      entityId: id,
      newValue: { outlet_id: payslip.outlet_id },
    });
    throw new OutletAccessError("You do not have access to this payslip.");
  }
  return payslip;
};
export const generateBatch = async (env: Env, context: AuthActor, input: PayslipGenerateInput) => {
  const run = await repository.findPayrollRun(env, context.companyId, input.payroll_run_id);
  if (!run) throw new NotFoundError("Payroll run could not be found.");
  if (!["finalized", "paid"].includes(run.status) || !run.finalized_at || !run.finalized_by) {
    throw new AppError(
      "Payslips can only be generated after payroll is finalized.",
      "PAYSLIP_PAYROLL_NOT_FINALIZED",
      409,
    );
  }
  const fullAccess = await hasFullPayrollAccess(env, context);
  if (input.outlet_id && !fullAccess && !context.outletIds.includes(input.outlet_id)) {
    throw new OutletAccessError("You do not have access to generate payslips for this outlet.");
  }
  const scopedOutletIds = input.outlet_id
    ? [input.outlet_id]
    : fullAccess
      ? undefined
      : context.outletIds;
  const [items, existingCount, scopedItemCount] = await Promise.all([
    payrollRepository.listPayrollItemsNeedingPayslipSnapshots(env, context.companyId, input.payroll_run_id, scopedOutletIds),
    repository.countExistingPayslipsForRun(env, context.companyId, input.payroll_run_id, scopedOutletIds),
    repository.countPayrollItemsForRun(env, context.companyId, input.payroll_run_id, scopedOutletIds),
  ]);
  let payslipSnapshots: Awaited<ReturnType<typeof buildPayslipSnapshots>> = [];
  if (items.length > 0) {
    payslipSnapshots = await buildPayslipSnapshots(env, context, run, {
      finalizedAt: run.finalized_at,
      finalizedBy: run.finalized_by,
      outletIds: scopedOutletIds,
    });
    await payrollRepository.upsertPayslipSnapshots(env, {
      companyId: context.companyId,
      run,
      actorId: context.actorUserId,
      finalizedAt: run.finalized_at,
      payslipSnapshots,
    });
  }
  const created = Math.max(0, scopedItemCount - existingCount);
  await ensureAudit(env, context, {
    action: PAYSLIP_AUDIT_ACTIONS.generated,
    entityId: input.payroll_run_id,
    newValue: {
      created,
      repaired_or_verified: payslipSnapshots.length,
      scope: fullAccess && !input.outlet_id ? "company" : "accessible_outlets",
      outlet_id: input.outlet_id,
    },
    reason: input.reason,
  });
  return {
    created,
    skipped_existing: existingCount,
    repaired_or_verified: payslipSnapshots.length,
    skipped_inaccessible: 0,
    scope: fullAccess && !input.outlet_id ? "company" : "accessible_outlets",
    scoped_item_count: scopedItemCount,
  };
};
export const listPayslips = async (env: Env, context: AuthActor, filters: PayslipFilters): Promise<PayslipListResult<any>> => {
  const isSuperAdmin = permissionService.isSuperAdmin(context);
  const total = await repository.countPayslips(env, context.companyId, filters, context.outletIds, isSuperAdmin);
  const rows = await repository.listPayslips(env, context.companyId, filters, context.outletIds, isSuperAdmin);
  return { rows: rows.map(sanitizePayslipForResponse), pagination: pagination(filters.page, filters.page_size, total) };
};
export const getPayslip = async (env: Env, context: AuthActor, id: string) => {
  const payslip = await ensurePayslip(env, context, id);
  await bestEffortAudit(env, context, { action: PAYSLIP_AUDIT_ACTIONS.viewed, entityId: id });
  return sanitizePayslipForResponse(payslip);
};

export const listRunPayslips = async (env: Env, context: AuthActor, runId: string, filters: PayslipFilters) =>
  listPayslips(env, context, { ...filters, payroll_run_id: runId });

export const getRunPayslip = async (env: Env, context: AuthActor, runId: string, id: string) => {
  const payslip = await getPayslip(env, context, id);
  if (payslip.payroll_run_id !== runId) throw new NotFoundError("Payslip could not be found for this payroll run.");
  return payslip;
};

export const listEmployeePayslips = async (env: Env, context: AuthActor, employeeId: string, filters: PayslipFilters) =>
  listPayslips(env, context, { ...filters, employee_id: employeeId });

export const downloadPayslip = async (env: Env, context: AuthActor, id: string) => {
  const payslip = await ensurePayslip(env, context, id);
  await repository.markPayslipDownloaded(env, context.companyId, id);
  await bestEffortAudit(env, context, { action: PAYSLIP_AUDIT_ACTIONS.downloaded, entityId: id });
  return {
    available: true,
    mode: "print",
    print_url: `/api/v1/payslips/${id}/print`,
    message: "Payslip PDF generation is not available yet. Use the print view to save this payslip as PDF.",
    payslip: sanitizePayslipForResponse(payslip),
  };
};

const tableRows = (rows: any[], labelKey: string, currency: string) => rows.map((row) => `
  <tr>
    <td>${escapeHtml(firstDefined(row.description, row.calculation_code, row[labelKey], "Line item"))}</td>
    <td>${escapeHtml(firstDefined(row.source_reference, row.source_type, ""))}</td>
    <td class="amount">${escapeHtml(money(row.amount, currency))}</td>
  </tr>`).join("");

export const renderPayslipPrintHtml = (safePayslip: ReturnType<typeof sanitizePayslipForResponse>) => {
  const currency = String((safePayslip.totals as any)?.currency ?? (safePayslip.payroll_period as any)?.currency ?? "MVR");
  const employee = safePayslip.employee as Record<string, unknown>;
  const company = safePayslip.company as Record<string, unknown>;
  const period = safePayslip.payroll_period as Record<string, unknown>;
  const totals = safePayslip.totals as Record<string, unknown>;
  const earnings = Array.isArray(safePayslip.earnings) ? safePayslip.earnings as any[] : [];
  const deductions = Array.isArray(safePayslip.deductions) ? safePayslip.deductions as any[] : [];
  const nonCash = Array.isArray(safePayslip.non_cash_benefits) ? safePayslip.non_cash_benefits as any[] : [];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payslip ${escapeHtml(period.payroll_month ?? safePayslip.payroll_month ?? "")}</title>
  <style>
    body { color: #1f2933; font-family: Georgia, "Times New Roman", serif; margin: 32px; }
    .shell { border: 1px solid #d7dce2; margin: 0 auto; max-width: 920px; padding: 28px; }
    .top { align-items: flex-start; display: flex; justify-content: space-between; gap: 24px; }
    h1, h2 { margin: 0; }
    h1 { font-size: 28px; }
    h2 { border-bottom: 1px solid #d7dce2; font-size: 18px; margin-top: 28px; padding-bottom: 8px; }
    .muted { color: #697586; }
    .grid { display: grid; gap: 8px 24px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 18px; }
    .label { color: #697586; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .value { font-size: 15px; margin-top: 2px; }
    table { border-collapse: collapse; margin-top: 12px; width: 100%; }
    th, td { border-bottom: 1px solid #e5eaf0; padding: 10px 8px; text-align: left; }
    th { background: #f6f8fa; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .amount { text-align: right; white-space: nowrap; }
    .totals { margin-left: auto; max-width: 420px; }
    .print-note { border-top: 1px solid #d7dce2; color: #697586; font-size: 12px; margin-top: 28px; padding-top: 14px; }
    @media print { body { margin: 0; } .shell { border: none; max-width: none; } }
  </style>
</head>
<body>
  <main class="shell">
    <section class="top">
      <div>
        <h1>${escapeHtml(company.name ?? "Company")}</h1>
        <p class="muted">Finalized payroll payslip snapshot</p>
      </div>
      <div class="amount">
        <div class="label">Payroll month</div>
        <div class="value">${escapeHtml(period.payroll_month ?? safePayslip.payroll_month ?? "")}</div>
      </div>
    </section>
    <section class="grid">
      <div><div class="label">Employee</div><div class="value">${escapeHtml(employee.name ?? safePayslip.employee_name ?? "")}</div></div>
      <div><div class="label">Employee code</div><div class="value">${escapeHtml(employee.code ?? safePayslip.employee_code ?? "")}</div></div>
      <div><div class="label">Outlet</div><div class="value">${escapeHtml(employee.outlet_name ?? safePayslip.outlet_name ?? "Unassigned")}</div></div>
      <div><div class="label">Department / Position</div><div class="value">${escapeHtml(firstDefined(employee.department_name, "Not recorded"))} / ${escapeHtml(firstDefined(employee.position_name, "Not recorded"))}</div></div>
      <div><div class="label">Period</div><div class="value">${escapeHtml(period.period_start ?? "")} to ${escapeHtml(period.period_end ?? "")}</div></div>
      <div><div class="label">Status</div><div class="value">${escapeHtml(safePayslip.status ?? "finalized")}</div></div>
    </section>
    <h2>Earnings</h2>
    <table><thead><tr><th>Description</th><th>Source</th><th class="amount">Amount</th></tr></thead><tbody>${tableRows(earnings, "earning_type", currency) || `<tr><td colspan="3">No earnings recorded.</td></tr>`}</tbody></table>
    <h2>Deductions</h2>
    <table><thead><tr><th>Description</th><th>Source</th><th class="amount">Amount</th></tr></thead><tbody>${tableRows(deductions, "deduction_type", currency) || `<tr><td colspan="3">No deductions recorded.</td></tr>`}</tbody></table>
    <h2>Non-Cash Benefits</h2>
    <table><thead><tr><th>Description</th><th>Source</th><th class="amount">Value</th></tr></thead><tbody>${tableRows(nonCash, "earning_type", currency) || `<tr><td colspan="3">No non-cash benefits recorded.</td></tr>`}</tbody></table>
    <h2>Totals</h2>
    <table class="totals"><tbody>
      <tr><td>Basic salary</td><td class="amount">${escapeHtml(money(totals.basic_salary_amount, currency))}</td></tr>
      <tr><td>Payable basic</td><td class="amount">${escapeHtml(money(totals.payable_basic_amount, currency))}</td></tr>
      <tr><td>Gross salary</td><td class="amount">${escapeHtml(money(totals.gross_amount, currency))}</td></tr>
      <tr><td>Total deductions</td><td class="amount">${escapeHtml(money(totals.total_deductions_amount, currency))}</td></tr>
      <tr><td><strong>Net salary</strong></td><td class="amount"><strong>${escapeHtml(money(totals.net_amount, currency))}</strong></td></tr>
    </tbody></table>
    <p class="print-note">This page is generated from an immutable finalized payroll snapshot. Use your browser print dialog to save it as PDF.</p>
  </main>
</body>
</html>`;
};

export const printPayslip = async (env: Env, context: AuthActor, id: string) => {
  const payslip = await ensurePayslip(env, context, id);
  await repository.markPayslipPrinted(env, context.companyId, id);
  await bestEffortAudit(env, context, { action: PAYSLIP_AUDIT_ACTIONS.printed, entityId: id });
  return renderPayslipPrintHtml(sanitizePayslipForResponse(payslip));
};
