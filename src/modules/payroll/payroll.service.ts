import { PAYROLL_AUDIT_ACTIONS } from "./payroll.constants";
import * as calculator from "./payroll.calculator";
import * as approvalService from "./payroll-approval.service";
import * as exceptionService from "./payroll-exception.service";
import * as exportService from "./payroll-export.service";
import * as lockService from "./payroll-lock.service";
import * as repository from "./payroll.repository";
import type {
  PayrollActionInput,
  PayrollCalculateInput,
  PayrollCalculationResult,
  PayrollExceptionFilters,
  PayrollExceptionResolveInput,
  PayrollItemFilters,
  PayrollListFilters,
  PayrollListResult,
  PayrollRunRecord,
} from "./payroll.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import { broadcastEvent } from "../../services/realtime.service";
import * as settingsService from "../../services/settings.service";
import { getPayrollSyncBlockers } from "../sync/sync.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, OutletAccessError, PayrollBlockedError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({
  page,
  page_size: pageSize,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
});
const scope = (context: AuthActor) => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
});

export const hasFullPayrollAccess = async (env: Env, context: AuthActor): Promise<boolean> => {
  if (context.isSuperAdmin || permissionService.isSuperAdmin(context)) return true;
  if (permissionService.hasPermission(context, "payroll.full_access")) return true;
  if (!context.isAdmin) return false;
  if (!permissionService.hasAnyPermission(context, ["payroll.view", "payroll.calculate", "payroll.recalculate"])) return false;
  const activeOutletIds = await repository.listActiveOutletIds(env, context.companyId);
  return activeOutletIds.every((outletId) => context.outletIds.includes(outletId));
};

export const getAccessiblePayrollOutletIds = async (env: Env, context: AuthActor): Promise<string[]> => {
  if (await hasFullPayrollAccess(env, context)) {
    return repository.listActiveOutletIds(env, context.companyId);
  }
  return context.outletIds;
};

const scopedPayrollAccess = async (env: Env, context: AuthActor) => {
  const fullAccess = await hasFullPayrollAccess(env, context);
  return {
    fullAccess,
    outletIds: fullAccess ? await repository.listActiveOutletIds(env, context.companyId) : context.outletIds,
    totalsScope: fullAccess ? "company" : "accessible_outlets",
  };
};

const payrollScope = (fullAccess: boolean, outletIds: string[]) => ({
  isSuperAdmin: fullAccess,
  outletIds,
});

const assertFullPayrollCalculationAccess = async (env: Env, context: AuthActor, input?: { outlet_id?: string }) => {
  if (input?.outlet_id || !(await hasFullPayrollAccess(env, context))) {
    throw new AppError(
      "Payroll calculation for a company-wide payroll run requires full payroll access.",
      "PAYROLL_FULL_ACCESS_REQUIRED",
      403,
    );
  }
};

const assertFullPayrollLifecycleAccess = async (env: Env, context: AuthActor) => {
  if (!(await hasFullPayrollAccess(env, context))) {
    throw new AppError(
      "This company-wide payroll action requires full payroll access.",
      "PAYROLL_FULL_ACCESS_REQUIRED",
      403,
    );
  }
};

const calculationAlreadyRunningError = () =>
  new AppError(
    "Payroll calculation is already running. Please wait and try again.",
    "PAYROLL_CALCULATION_ALREADY_RUNNING",
    409,
  );

const payrollError = (message: string, code: string, statusCode = 409) =>
  new AppError(message, code, statusCode);

const payrollLockReplacedByFinalizationError = () =>
  payrollError(
    "Payroll locking is now handled by payroll finalization. Use Finalize Payroll instead.",
    "PAYROLL_LOCK_REPLACED_BY_FINALIZATION",
  );

const payrollReopenNotImplementedError = () =>
  payrollError(
    "Payroll reopen/reversal requires a dedicated safe reversal workflow and is not available yet.",
    "PAYROLL_REOPEN_NOT_IMPLEMENTED",
    501,
  );

const payrollFinalizationIncompleteError = () =>
  payrollError(
    "Payroll finalization could not be completed safely. Please retry finalization.",
    "PAYROLL_FINALIZATION_INCOMPLETE",
  );

const ensureAudit = async (
  env: Env,
  context: AuthActor,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    module: "payroll",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: context.actorUserId,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason ?? undefined,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};

const broadcast = (env: Env, context: AuthActor, type: string, payload: Record<string, unknown>) =>
  broadcastEvent(env, {
    roomName: `company:${context.companyId}`,
    type,
    payload,
    triggeredBy: context.actorUserId,
  }).catch((error) => console.error("Payroll realtime event failed", error));

const ensureRun = async (env: Env, context: AuthActor, id: string) => {
  const run = await repository.findRunById(env, context.companyId, id);
  if (!run) throw new NotFoundError("Payroll run could not be found.");
  return run;
};

const payrollApprovalSnapshot = (run: PayrollRunRecord, itemCount: number, criticalExceptions: number, reason?: string) => ({
  payroll_run_id: run.id,
  payroll_month: run.payroll_month,
  calculation_version: run.calculation_version ?? 0,
  employee_count: itemCount,
  total_gross_amount: run.total_gross_amount,
  total_deduction_amount: run.total_deduction_amount,
  total_net_amount: run.total_net_amount,
  critical_exception_count: criticalExceptions,
  reason,
});

const safeJson = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const groupByPayrollItem = (rows: any[]) => rows.reduce((map, row) => {
  const key = row.payroll_item_id;
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(row);
  return map;
}, new Map<string, any[]>());

const payslipLineSnapshot = (line: any, typeKey: "earning_type" | "deduction_type") => ({
  id: line.id,
  type: line[typeKey],
  amount: line.amount ?? 0,
  source_type: line.source_type ?? null,
  source_id: line.source_id ?? null,
  source_reference: line.source_reference ?? null,
  calculation_code: line.calculation_code ?? null,
  description: line.calculation_description ?? line.notes ?? null,
  metadata: safeJson(line.calculation_metadata_json),
});

const assertPayrollApprovalSnapshotCurrent = async (env: Env, context: AuthActor, run: PayrollRunRecord) => {
  if (!run.approval_request_id) return;
  const approval = await repository.findApprovalRequest(env, context.companyId, run.approval_request_id);
  if (!approval) return;
  const payload = safeJson(approval.payload_json);
  if (
    Number(payload.calculation_version ?? -1) !== Number(run.calculation_version ?? 0)
    || Number(payload.total_gross_amount ?? -1) !== Number(run.total_gross_amount ?? 0)
    || Number(payload.total_deduction_amount ?? -1) !== Number(run.total_deduction_amount ?? 0)
    || Number(payload.total_net_amount ?? -1) !== Number(run.total_net_amount ?? 0)
  ) {
    throw payrollError("Payroll approval is stale because the payroll calculation changed. Please resubmit approval.", "PAYROLL_APPROVAL_STALE");
  }
};

const assertItemAccess = (context: AuthActor, outletId: string | null | undefined) => {
  if (!permissionService.hasOutletAccess(context, outletId)) {
    throw new OutletAccessError("You do not have access to this payroll record.");
  }
};

export const listPayroll = async (
  env: Env,
  context: AuthActor,
  filters: PayrollListFilters,
): Promise<PayrollListResult<any>> => {
  const access = await scopedPayrollAccess(env, context);
  const runScope = payrollScope(access.fullAccess, access.outletIds);
  const total = await repository.countRuns(env, context.companyId, filters, runScope);
  const rows = await repository.listRuns(env, context.companyId, filters, runScope);
  return {
    rows: await Promise.all(rows.map((run) => decorateRunTotals(env, context, run, access, filters.outlet_id))),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getPayroll = async (env: Env, context: AuthActor, id: string) => {
  const run = await ensureRun(env, context, id);
  const access = await scopedPayrollAccess(env, context);
  const runScope = payrollScope(access.fullAccess, access.outletIds);
  const itemTotal = await repository.countItems(env, context.companyId, id, { page: 1, page_size: 1 }, runScope);
  const exceptionTotal = await repository.countExceptions(env, context.companyId, id, { page: 1, page_size: 1 }, runScope);
  return { ...(await decorateRunTotals(env, context, run, access)), item_count: itemTotal, exception_count: exceptionTotal };
};

export const getPayrollByMonth = async (env: Env, context: AuthActor, payrollMonth: string) => {
  const run = await repository.findRunByMonth(env, context.companyId, payrollMonth);
  if (!run) throw new NotFoundError("Payroll run could not be found.");
  return decorateRunTotals(env, context, run, await scopedPayrollAccess(env, context));
};

const decorateRunTotals = async (
  env: Env,
  context: AuthActor,
  run: any,
  access: { fullAccess: boolean; outletIds: string[]; totalsScope: string },
  outletId?: string,
) => {
  if (access.fullAccess && !outletId) {
    return { ...run, totals_scope: "company" };
  }
  const totals = await repository.getRunItemTotals(
    env,
    context.companyId,
    run.id,
    payrollScope(access.fullAccess, access.outletIds),
    outletId,
  );
  return { ...run, ...totals, totals_scope: access.fullAccess && !outletId ? "company" : "accessible_outlets" };
};

const attendancePayrollDeductionsEnabled = async (env: Env, context: AuthActor) => {
  const attendanceEnabled = await settingsService.isFeatureEnabled(env, context.companyId, "attendance", context).catch(() => false);
  if (!attendanceEnabled) return false;
  const attendanceSettings = await settingsService.getAttendanceSettings(env, context.companyId).catch(() => ({})) as Record<string, unknown>;
  const configured =
    attendanceSettings["attendance.payroll_deductions_enabled"] ??
    attendanceSettings.absent_day_deduction_enabled ??
    attendanceSettings.deduct_absent_days;
  return configured !== false;
};

const loadPayrollCalculationSettings = async (env: Env, context: AuthActor) => {
  const [payrollSettings, attendanceSettings, attendanceDeductionsEnabled] = await Promise.all([
    settingsService.getPayrollSettings(env, context.companyId),
    settingsService.getAttendanceSettings(env, context.companyId).catch(() => ({})),
    attendancePayrollDeductionsEnabled(env, context),
  ]);
  const mergedSettings = { ...payrollSettings, ...attendanceSettings };
  if (!attendanceDeductionsEnabled) {
    mergedSettings["attendance.payroll_deductions_enabled"] = false;
    mergedSettings.absent_day_deduction_enabled = false;
    mergedSettings.deduct_absent_days = false;
    mergedSettings.deduct_late_minutes = false;
    mergedSettings.deduct_early_checkout = false;
    mergedSettings.require_complete_attendance_before_calculation = false;
    mergedSettings.require_complete_attendance_before_payroll = false;
    mergedSettings.missing_attendance_counts_as_absent = false;
  }
  return calculator.parsePayrollSettings(mergedSettings);
};

const calculateRun = async (
  env: Env,
  context: AuthActor,
  input: PayrollCalculateInput,
  existingRunId?: string,
) => {
  await assertFullPayrollCalculationAccess(env, context, input);
  const existing = existingRunId
    ? await ensureRun(env, context, existingRunId)
    : await repository.findRunByMonth(env, context.companyId, input.payroll_month);
  if (existing) {
    lockService.assertPayrollRunEditable(existing);
  }
  const settings = await loadPayrollCalculationSettings(env, context);
  const runId = existing?.id ?? createPrefixedId("payroll");
  const periodStart = calculator.monthStartDate(input.payroll_month);
  const periodEnd = calculator.monthEndDate(input.payroll_month);
  const timeout = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  if (existing) {
    const locked = await repository.markRunCalculating(env, context.companyId, runId, context.actorUserId, timeout);
    if (!locked) throw calculationAlreadyRunningError();
  }
  await repository.upsertRun(env, {
    id: runId,
    companyId: context.companyId,
    payrollMonth: input.payroll_month,
    status: "draft",
    calculationBasis: settings.salaryBasis,
    currency: settings.currency ?? "MVR",
    periodStart,
    periodEnd,
    calculationSettingsJson: JSON.stringify(settings),
    calculatedBy: context.actorUserId,
  });
  if (!existing) {
    const locked = await repository.markRunCalculating(env, context.companyId, runId, context.actorUserId, timeout);
    if (!locked) throw calculationAlreadyRunningError();
  }

  const calculationRun = await repository.findRunById(env, context.companyId, runId);
  const calculationVersion = calculationRun?.calculation_version ?? 0;

  try {
    const results = await calculatePayrollInMemory(env, context, input, runId, settings, calculationVersion);
    const generatedTotals = totalCalculationResults(results);
    const manualTotals = await repository.getManualItemTotals(env, context.companyId, runId);
    const totals = {
      gross: generatedTotals.gross + manualTotals.gross,
      deductions: generatedTotals.deductions + manualTotals.deductions,
      net: generatedTotals.net + manualTotals.net,
    };
    await repository.persistRunCalculation(env, {
      companyId: context.companyId,
      runId,
      results,
      totals,
    });
    return repository.findRunById(env, context.companyId, runId);
  } catch (error) {
    await repository.markRunCalculationFailed(env, context.companyId, runId).catch(() => undefined);
    await exceptionService.createPayrollException(env, {
      companyId: context.companyId,
      payrollRunId: runId,
      exceptionType: "calculation_warning",
      severity: "critical",
      message: "Payroll calculation failed. Please review the payroll source data and try again.",
    }).catch(() => undefined);
    throw error;
  }
};

const calculatePayrollInMemory = async (
  env: Env,
  context: AuthActor,
  input: PayrollCalculateInput,
  runId: string,
  settings: ReturnType<typeof calculator.parsePayrollSettings>,
  calculationVersion: number,
) => {
  const employees = await repository.listEligibleEmployees(env, context.companyId, input, { isSuperAdmin: true, outletIds: [] });
  const results: PayrollCalculationResult[] = [];
  for (const employee of employees) {
    results.push(await calculator.calculateEmployeePayroll(env, {
      companyId: context.companyId,
      payrollRunId: runId,
      payrollMonth: input.payroll_month,
      employee,
      settings,
      calculationVersion,
    }));
  }
  return results;
};

const totalCalculationResults = (results: PayrollCalculationResult[]) =>
  results.reduce(
    (totals, result) => ({
      gross: totals.gross + result.item.gross_amount,
      deductions: totals.deductions + result.item.total_deductions_amount,
      net: totals.net + result.item.net_amount,
    }),
    { gross: 0, deductions: 0, net: 0 },
  );

export const calculatePayroll = async (env: Env, context: AuthActor, input: PayrollCalculateInput) => {
  await assertFullPayrollCalculationAccess(env, context, input);
  const existing = await repository.findRunByMonth(env, context.companyId, input.payroll_month);
  if (existing && !input.reason) throw new ConflictError("A reason is required to recalculate an existing payroll.");
  const run = await calculateRun(env, context, input) as PayrollRunRecord | null;
  await ensureAudit(env, context, {
    action: existing ? PAYROLL_AUDIT_ACTIONS.recalculated : PAYROLL_AUDIT_ACTIONS.calculated,
    entityType: "payroll_run",
    entityId: run!.id,
    oldValue: existing,
    newValue: run,
    reason: input.reason,
  });
  await broadcast(env, context, existing ? "payroll.recalculated" : "payroll.calculated", { payroll_run_id: run!.id });
  return { payroll_run: run };
};

export const recalculatePayroll = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollCalculationAccess(env, context);
  const run = await ensureRun(env, context, id);
  lockService.assertPayrollRunEditable(run);
  const recalculated = await calculateRun(env, context, { payroll_month: run.payroll_month, reason: input.reason }, id);
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.recalculated,
    entityType: "payroll_run",
    entityId: id,
    oldValue: run,
    newValue: recalculated,
    reason: input.reason,
  });
  await broadcast(env, context, "payroll.recalculated", { payroll_run_id: id });
  return { payroll_run: recalculated };
};

export const previewPayrollCalculation = async (env: Env, context: AuthActor, id: string) => {
  await assertFullPayrollCalculationAccess(env, context);
  const run = await ensureRun(env, context, id);
  lockService.assertPayrollRunEditable(run);
  const settings = await loadPayrollCalculationSettings(env, context);
  const results = await calculatePayrollInMemory(
    env,
    context,
    { payroll_month: run.payroll_month },
    run.id,
    settings,
    run.calculation_version ?? 0,
  );
  const totals = totalCalculationResults(results);
  return {
    payroll_run: run,
    preview: {
      employee_count: results.length,
      gross: totals.gross,
      deductions: totals.deductions,
      net: totals.net,
      warnings: results.flatMap((result) => result.warnings ?? []),
      errors: results.flatMap((result) => result.exceptions.filter((exception) => exception.severity === "critical")),
      settings_snapshot: settings,
      calculation_metadata: {
        source: "preview",
        calculation_version: run.calculation_version ?? 0,
        payroll_month: run.payroll_month,
      },
    },
  };
};

export const listItems = async (env: Env, context: AuthActor, runId: string, filters: PayrollItemFilters) => {
  await ensureRun(env, context, runId);
  const total = await repository.countItems(env, context.companyId, runId, filters, scope(context));
  return {
    rows: await repository.listItems(env, context.companyId, runId, filters, scope(context)),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getItem = async (env: Env, context: AuthActor, runId: string, itemId: string) => {
  await ensureRun(env, context, runId);
  const item = await repository.findItem(env, context.companyId, runId, itemId);
  if (!item) throw new NotFoundError("Payroll item could not be found.");
  assertItemAccess(context, item.outlet_id);
  return item;
};

export const listExceptions = (env: Env, context: AuthActor, runId: string, filters: PayrollExceptionFilters) =>
  exceptionService.listPayrollExceptions(env, context.companyId, runId, filters, scope(context));

export const resolveException = async (env: Env, context: AuthActor, runId: string, exceptionId: string, input: PayrollExceptionResolveInput) => {
  await ensureRun(env, context, runId);
  await repository.resolveException(env, context.companyId, runId, exceptionId, context.actorUserId);
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.exceptionResolved,
    entityType: "payroll_exception",
    entityId: exceptionId,
    reason: input.reason,
    newValue: { resolution_notes: input.resolution_notes },
  });
  return { resolved: true };
};

const createBlockerExceptions = async (env: Env, context: AuthActor, runId: string, payrollMonth: string) => {
  const attendanceEnabled = await settingsService.isFeatureEnabled(env, context.companyId, "attendance", context).catch(() => false);
  const blockers = await getPayrollSyncBlockers(env, context.companyId, payrollMonth);
  let syncBlocked = false;
  let attendanceBlocked = false;
  let longLeaveBlocked = false;
  if (attendanceEnabled && (blockers.pending_sync_items ?? 0) > 0) {
    syncBlocked = true;
    await exceptionService.createPayrollException(env, {
      companyId: context.companyId,
      payrollRunId: runId,
      exceptionType: "pending_sync",
      severity: "critical",
      message: "Payroll cannot be finalized while attendance sync is pending.",
    });
  }
  if (attendanceEnabled && (blockers.unresolved_sync_conflicts ?? 0) > 0) {
    syncBlocked = true;
    await exceptionService.createPayrollException(env, {
      companyId: context.companyId,
      payrollRunId: runId,
      exceptionType: "unresolved_sync_conflict",
      severity: "critical",
      message: "Payroll cannot be finalized while attendance sync conflicts are unresolved.",
    });
  }
  if (attendanceEnabled) {
    const [attendanceConflicts, attendanceCorrections, problemSummaries] = await Promise.all([
      repository.countPendingAttendanceConflicts(env, context.companyId, payrollMonth),
      repository.countPendingAttendanceCorrections(env, context.companyId, payrollMonth),
      repository.countProblemAttendanceSummaries(env, context.companyId, payrollMonth),
    ]);
    if (attendanceConflicts > 0) {
      attendanceBlocked = true;
      await exceptionService.createPayrollException(env, {
        companyId: context.companyId,
        payrollRunId: runId,
        exceptionType: "unresolved_attendance_conflict",
        severity: "critical",
        message: "Payroll cannot be locked because there are unresolved attendance issues.",
      });
    }
    if (attendanceCorrections > 0) {
      attendanceBlocked = true;
      await exceptionService.createPayrollException(env, {
        companyId: context.companyId,
        payrollRunId: runId,
        exceptionType: "pending_attendance_correction",
        severity: "critical",
        message: "Payroll cannot be locked because there are unresolved attendance issues.",
      });
    }
    if (problemSummaries > 0) {
      attendanceBlocked = true;
      await exceptionService.createPayrollException(env, {
        companyId: context.companyId,
        payrollRunId: runId,
        exceptionType: "missing_clock_in",
        severity: "critical",
        message: "Payroll cannot be locked because there are unresolved attendance issues.",
      });
    }
  }
  const payrollSettings = await settingsService.getPayrollSettings(env, context.companyId).catch(() => ({}));
  if (attendanceEnabled && (payrollSettings as Record<string, unknown>).attendance_to_payroll_enabled === true) {
    const missingSummaries = await repository.countActiveEmployeesMissingAttendanceSummaries(env, context.companyId, payrollMonth);
    if (missingSummaries > 0) {
      attendanceBlocked = true;
      await exceptionService.createPayrollException(env, {
        companyId: context.companyId,
        payrollRunId: runId,
        exceptionType: "missing_attendance_summary",
        severity: "critical",
        message: "Payroll cannot be locked because there are unresolved attendance issues.",
      });
    }
  }
  const missingSalary = await repository.countEmployeesMissingSalaryHistory(env, context.companyId, payrollMonth);
  if (missingSalary > 0) {
    await exceptionService.createPayrollException(env, {
      companyId: context.companyId,
      payrollRunId: runId,
      exceptionType: "missing_salary",
      severity: "critical",
      message: "Salary history is missing for one or more employees.",
    });
  }
  const unconfirmedLongLeave = await repository.listUnconfirmedLongLeave(env, context.companyId, payrollMonth);
  for (const record of unconfirmedLongLeave) {
    longLeaveBlocked = true;
    await exceptionService.createPayrollException(env, {
      companyId: context.companyId,
      payrollRunId: runId,
      employeeId: record.employee_id,
      outletId: record.outlet_id,
      exceptionType: "unconfirmed_long_leave_salary_impact",
      severity: "critical",
      message: "Long leave salary impact must be confirmed before payroll can be locked.",
    });
  }
  if (syncBlocked) throw new PayrollBlockedError("Payroll cannot be finalized while attendance sync is pending.");
  if (attendanceBlocked) throw new PayrollBlockedError("Payroll cannot be locked because there are unresolved attendance issues.");
  if (longLeaveBlocked) throw new PayrollBlockedError("Long leave salary impact must be confirmed before payroll can be locked.");
};

export const submitApproval = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  const run = await ensureRun(env, context, id);
  lockService.assertPayrollRunEditable(run);
  if (run.status === "pending_approval" || run.status === "submitted") {
    throw payrollError("Payroll approval is already pending.", "PAYROLL_APPROVAL_ALREADY_PENDING");
  }
  if (!["calculated", "reviewed", "reopened"].includes(run.status)) {
    throw payrollError("Payroll must be calculated before it can be submitted for approval.", "PAYROLL_RUN_NOT_CALCULATED");
  }
  const itemCount = await repository.countItemsForRun(env, context.companyId, id);
  if (itemCount === 0) {
    throw payrollError("Payroll must have calculated employee items before approval.", "PAYROLL_RUN_NOT_CALCULATED");
  }
  const criticalExceptions = await repository.countOpenCriticalExceptions(env, context.companyId, id);
  if (criticalExceptions > 0) {
    throw payrollError("Payroll has blocking errors that must be resolved before approval.", "PAYROLL_HAS_BLOCKING_ERRORS");
  }
  const payload = payrollApprovalSnapshot(run, itemCount, criticalExceptions, input.reason);
  const approvalRequestId = await approvalService.createApprovalRequest(env, context, {
    workflowKey: "payroll_finalization",
    module: "payroll",
    entityType: "payroll_run",
    entityId: id,
    summary: "Payroll run needs approval.",
    payload,
  });
  if (!approvalRequestId) {
    await ensureAudit(env, context, {
      action: PAYROLL_AUDIT_ACTIONS.submittedForApproval,
      entityType: "payroll_run",
      entityId: id,
      newValue: { approval_required: false, ...payload },
      reason: input.reason,
    });
    return { approval_required: false, message: "Approval workflows are disabled. Authorized users can approve directly." };
  }
  const result = await repository.submitRunForApproval(env, {
    companyId: context.companyId,
    runId: id,
    approvalRequestId,
    actorId: context.actorUserId,
  });
  if ((result.meta?.changes ?? 0) === 0) {
    throw payrollError("Payroll approval is already pending.", "PAYROLL_APPROVAL_ALREADY_PENDING");
  }
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.submittedForApproval,
    entityType: "payroll_run",
    entityId: id,
    newValue: { approval_request_id: approvalRequestId, ...payload },
    reason: input.reason,
  });
  return { approval_request_id: approvalRequestId };
};

export const approvePayroll = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  const run = await ensureRun(env, context, id);
  lockService.assertPayrollRunEditable(run);
  if (!["pending_approval", "submitted", "approved"].includes(run.status)) {
    throw new ConflictError("Payroll must be pending approval before it can be approved.");
  }
  await assertPayrollApprovalSnapshotCurrent(env, context, run);
  if ((await repository.countOpenCriticalExceptions(env, context.companyId, id)) > 0) {
    throw new PayrollBlockedError("Payroll cannot be locked because there are unresolved exceptions.");
  }
  await repository.updateRunStatus(env, context.companyId, id, { status: "approved", approvedBy: context.actorUserId });
  if (run.approval_request_id) {
    await repository.updateApprovalRequestStatus(env, context.companyId, run.approval_request_id, "approved");
  }
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.approved,
    entityType: "payroll_run",
    entityId: id,
    oldValue: run,
    newValue: { status: "approved" },
    reason: input.reason,
  });
  await broadcast(env, context, "payroll.approved", { payroll_run_id: id });
  return { approved: true };
};

export const rejectPayroll = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  const run = await ensureRun(env, context, id);
  lockService.assertPayrollRunEditable(run);
  if (!["pending_approval", "submitted"].includes(run.status)) {
    throw new ConflictError("Payroll must be pending approval before it can be rejected.");
  }
  await repository.updateRunStatus(env, context.companyId, id, { status: "calculated" });
  if (run.approval_request_id) {
    await repository.updateApprovalRequestStatus(env, context.companyId, run.approval_request_id, "rejected");
  }
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.rejected,
    entityType: "payroll_run",
    entityId: id,
    oldValue: run,
    newValue: { status: "calculated", rejected_from: run.status },
    reason: input.reason,
  });
  return { rejected: true };
};

export const lockPayroll = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  await ensureRun(env, context, id);
  void input;
  throw payrollLockReplacedByFinalizationError();
};

export const buildRepaymentApplications = (
  run: PayrollRunRecord,
  sources: Awaited<ReturnType<typeof repository.listRepaymentSourcesForRun>>,
  existing: Awaited<ReturnType<typeof repository.listExistingRepaymentApplications>>,
) => {
  const existingKeys = new Set(existing.map((row) => `${row.source_type}:${row.source_id}`));
  const remainingByItem = new Map<string, number>();
  const applications: Array<{
    id: string;
    payrollItemId: string;
    employeeId: string;
    sourceType: string;
    sourceId: string;
    appliedAmount: number;
    currency: string;
  }> = [];

  for (const source of sources) {
    const key = `${source.source_type}:${source.source_id}`;
    if (existingKeys.has(key)) continue;
    const remaining = remainingByItem.has(source.payroll_item_id)
      ? remainingByItem.get(source.payroll_item_id)!
      : source.item_total_deductions_amount;
    const appliedAmount = Math.max(0, Math.min(source.amount, remaining));
    remainingByItem.set(source.payroll_item_id, Math.max(0, remaining - appliedAmount));
    if (appliedAmount <= 0) continue;
    applications.push({
      id: createPrefixedId("pay_repay"),
      payrollItemId: source.payroll_item_id,
      employeeId: source.employee_id,
      sourceType: source.source_type,
      sourceId: source.source_id,
      appliedAmount,
      currency: source.currency ?? run.currency ?? "MVR",
    });
  }

  return applications;
};

export const buildPayslipSnapshots = async (
  env: Env,
  context: AuthActor,
  run: PayrollRunRecord,
  options?: { finalizedAt?: string; finalizedBy?: string; outletIds?: string[] },
) => {
  const [items, earnings, deductions] = await Promise.all([
    repository.listPayslipSnapshotItemsForRun(env, context.companyId, run.id, options?.outletIds),
    repository.listPayslipSnapshotEarningsForRun(env, context.companyId, run.id, options?.outletIds),
    repository.listPayslipSnapshotDeductionsForRun(env, context.companyId, run.id, options?.outletIds),
  ]);
  const earningsByItem = groupByPayrollItem(earnings);
  const deductionsByItem = groupByPayrollItem(deductions);

  return items.map((item) => {
    const itemEarnings = (earningsByItem.get(item.id) ?? []).map((line: any) => payslipLineSnapshot(line, "earning_type"));
    const itemDeductions = (deductionsByItem.get(item.id) ?? []).map((line: any) => payslipLineSnapshot(line, "deduction_type"));
    const calculation = safeJson(item.calculation_metadata_json);
    const nonCashBenefits = itemEarnings.filter((line: any) => {
      const metadata = line.metadata as Record<string, unknown>;
      return line.type === "non_cash_benefit" || metadata.calculation_type === "non_cash_benefit";
    });
    const employeeSnapshot = {
      id: item.employee_id,
      code: item.employee_code,
      name: item.employee_name,
      employee_type: item.employee_type,
      outlet_id: item.outlet_id,
      outlet_name: item.outlet_name,
      department_id: item.department_id ?? null,
      department_name: item.department_name ?? null,
      position_id: item.position_id ?? null,
      position_name: item.position_name ?? null,
    };
    const companySnapshot = {
      id: context.companyId,
      name: item.company_legal_name ?? item.company_name ?? "Company",
    };
    const periodSnapshot = {
      payroll_run_id: run.id,
      payroll_month: run.payroll_month,
      period_start: run.period_start ?? `${run.payroll_month}-01`,
      period_end: run.period_end ?? `${run.payroll_month}-31`,
      currency: run.currency ?? "MVR",
      calculation_version: item.calculation_version ?? run.calculation_version ?? 0,
      finalized_at: options?.finalizedAt ?? run.finalized_at ?? null,
      finalized_by: options?.finalizedBy ?? run.finalized_by ?? null,
    };
    const totalsSnapshot = {
        basic_salary_amount: item.basic_salary_amount,
        payable_basic_amount: item.payable_basic_amount,
        gross_amount: item.gross_amount,
        total_deductions_amount: item.total_deductions_amount,
        net_amount: item.net_amount,
        carry_forward_deduction_amount: item.carry_forward_deduction_amount,
        currency: run.currency ?? "MVR",
    };
    const snapshot = {
      status: "finalized",
      company: companySnapshot,
      employee: employeeSnapshot,
      payroll_period: periodSnapshot,
      salary: {
        basic_salary_amount: item.basic_salary_amount,
        payable_basic_amount: item.payable_basic_amount,
        salary_segments: ((calculation as any).salary_segments ?? (calculation as any).salary?.salary_segments ?? []) as unknown,
      },
      earnings: itemEarnings,
      deductions: itemDeductions,
      non_cash_benefits: nonCashBenefits,
      totals: totalsSnapshot,
      calculation: {
        ...calculation,
        payroll_item_id: item.id,
        calculation_version: item.calculation_version ?? run.calculation_version ?? 0,
        source_type: item.source_type ?? "payroll_calculation",
      },
    };
    return {
      id: createPrefixedId("payslip"),
      payrollItemId: item.id,
      employeeId: item.employee_id,
      calculationVersion: item.calculation_version ?? run.calculation_version ?? 0,
      snapshotJson: JSON.stringify(snapshot),
      employeeSnapshotJson: JSON.stringify(employeeSnapshot),
      companySnapshotJson: JSON.stringify(companySnapshot),
      periodSnapshotJson: JSON.stringify(periodSnapshot),
      earningsJson: JSON.stringify(itemEarnings),
      deductionsJson: JSON.stringify(itemDeductions),
      nonCashBenefitsJson: JSON.stringify(nonCashBenefits),
      totalsJson: JSON.stringify(totalsSnapshot),
    };
  });
};

export const finalizePayroll = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  const run = await ensureRun(env, context, id);
  if (run.status === "finalized") {
    return { finalized: true, already_finalized: true, payroll_run: run };
  }
  if (["finalizing"].includes(run.status)) {
    throw payrollError("Payroll finalization is already in progress. Please wait and try again.", "PAYROLL_FINALIZATION_IN_PROGRESS");
  }
  if (["locked", "paid"].includes(run.status)) {
    throw payrollError("Payroll has already been finalized, locked, or paid.", "PAYROLL_ALREADY_FINALIZED");
  }

  const approvalRequired = await settingsService.shouldRequireApproval(env, context.companyId, "payroll_finalization", context);
  if (approvalRequired && run.status !== "approved") {
    throw payrollError("Payroll must be approved before it can be finalized.", "PAYROLL_APPROVAL_REQUIRED", 403);
  }
  if (!approvalRequired && !["approved", "calculated", "reviewed", "reopened", "finalization_failed"].includes(run.status)) {
    throw new ConflictError("Payroll must be calculated or approved before it can be finalized.");
  }
  if ((await repository.countItemsForRun(env, context.companyId, id)) === 0) {
    throw payrollError("Payroll must have calculated employee items before finalization.", "PAYROLL_RUN_NOT_CALCULATED");
  }
  await createBlockerExceptions(env, context, id, run.payroll_month);
  if ((await repository.countOpenCriticalExceptions(env, context.companyId, id)) > 0) {
    throw new PayrollBlockedError("Payroll cannot be locked because there are unresolved exceptions.");
  }
  await assertPayrollApprovalSnapshotCurrent(env, context, run);

  const timeout = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const claimed = await repository.claimRunFinalization(env, context.companyId, id, context.actorUserId, timeout);
  if (!claimed) {
    const latest = await ensureRun(env, context, id);
    if (latest.status === "finalized") return { finalized: true, already_finalized: true, payroll_run: latest };
    throw payrollError("Payroll finalization is already in progress. Please wait and try again.", "PAYROLL_FINALIZATION_IN_PROGRESS");
  }

  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.finalizationStarted,
    entityType: "payroll_run",
    entityId: id,
    oldValue: run,
    reason: input.reason,
  });

  try {
    const finalizingRun = await ensureRun(env, context, id);
    const finalizedAt = new Date().toISOString();
    const [sources, existingRepayments, payslipSnapshots] = await Promise.all([
      repository.listRepaymentSourcesForRun(env, context.companyId, id),
      repository.listExistingRepaymentApplications(env, context.companyId, id),
      buildPayslipSnapshots(env, context, finalizingRun, {
        finalizedAt,
        finalizedBy: context.actorUserId,
      }),
    ]);
    const repaymentApplications = buildRepaymentApplications(finalizingRun, sources, existingRepayments);
    await repository.finalizeRunBatch(env, {
      companyId: context.companyId,
      run: finalizingRun,
      actorId: context.actorUserId,
      finalizedAt,
      repaymentApplications,
      payslipSnapshots,
    });
    const finalizedRun = await ensureRun(env, context, id);
    if (
      finalizedRun.status !== "finalized"
      || !finalizedRun.finalized_at
      || !finalizedRun.finalized_by
    ) {
      throw payrollFinalizationIncompleteError();
    }
    await ensureAudit(env, context, {
      action: PAYROLL_AUDIT_ACTIONS.finalized,
      entityType: "payroll_run",
      entityId: id,
      oldValue: run,
      newValue: {
        status: "finalized",
        repayment_applications: repaymentApplications.length,
        payslip_snapshots: payslipSnapshots.length,
      },
      reason: input.reason,
    });
    await broadcast(env, context, "payroll.finalized", { payroll_run_id: id });
    return {
      finalized: true,
      payroll_run: finalizedRun,
      repayments_applied: repaymentApplications.length,
      payslip_snapshots: payslipSnapshots.length,
    };
  } catch (error) {
    await repository.markRunFinalizationFailed(
      env,
      context.companyId,
      id,
      "Payroll finalization failed. Please review the payroll source data and try again.",
    ).catch(() => undefined);
    await ensureAudit(env, context, {
      action: PAYROLL_AUDIT_ACTIONS.finalizationFailed,
      entityType: "payroll_run",
      entityId: id,
      oldValue: run,
      newValue: { message: "Payroll finalization failed. Please review the payroll source data and try again." },
      reason: input.reason,
    }).catch(() => undefined);
    throw error;
  }
};

export const requestReopen = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  await ensureRun(env, context, id);
  void input;
  throw payrollReopenNotImplementedError();
};

export const approveReopen = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  await ensureRun(env, context, id);
  void input;
  throw payrollReopenNotImplementedError();
};

export const reopenPayroll = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  await ensureRun(env, context, id);
  void input;
  throw payrollReopenNotImplementedError();
};

export const exportPayroll = async (env: Env, context: AuthActor, id: string, outletId?: string) => {
  const run = await ensureRun(env, context, id);
  const access = await scopedPayrollAccess(env, context);
  if (outletId && !access.fullAccess && !access.outletIds.includes(outletId)) {
    throw new OutletAccessError("You do not have access to this payroll export.");
  }
  const exportJob = await exportService.preparePayrollExport(env, context, {
    payrollRunId: id,
    payrollMonth: run.payroll_month,
    totalsScope: access.fullAccess && !outletId ? "company" : "accessible_outlets",
    outletIds: outletId ? [outletId] : access.fullAccess ? [] : access.outletIds,
  });
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.exportPrepared,
    entityType: "payroll_run",
    entityId: id,
    newValue: exportJob,
  });
  return exportJob;
};
