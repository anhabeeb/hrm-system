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
  PayrollExceptionFilters,
  PayrollExceptionResolveInput,
  PayrollItemFilters,
  PayrollListFilters,
  PayrollListResult,
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
  const payrollSettings = await settingsService.getPayrollSettings(env, context.companyId);
  const settings = calculator.parsePayrollSettings(payrollSettings);
  const runId = existing?.id ?? createPrefixedId("payroll");
  await repository.upsertRun(env, {
    id: runId,
    companyId: context.companyId,
    payrollMonth: input.payroll_month,
    status: "draft",
    calculationBasis: settings.salaryBasis,
    calculatedBy: context.actorUserId,
  });
  await repository.clearRunCalculation(env, context.companyId, runId);

  const employees = await repository.listEligibleEmployees(env, context.companyId, input, { isSuperAdmin: true, outletIds: [] });
  let gross = 0;
  let deductions = 0;
  let net = 0;

  for (const employee of employees) {
    const result = await calculator.calculateEmployeePayroll(env, {
      companyId: context.companyId,
      payrollRunId: runId,
      payrollMonth: input.payroll_month,
      employee,
      settings,
    });
    await repository.createItem(env, result.item);
    gross += result.item.gross_amount;
    deductions += result.item.total_deductions_amount;
    net += result.item.net_amount;
    for (const earning of result.earnings) {
      await repository.createEarning(env, {
        id: createPrefixedId("pay_earn"),
        companyId: context.companyId,
        payrollItemId: result.item.id,
        earningType: earning.earning_type,
        amount: earning.amount,
        sourceType: earning.source_type,
        sourceId: earning.source_id,
        notes: earning.notes,
      });
    }
    for (const deduction of result.deductions) {
      await repository.createDeduction(env, {
        id: createPrefixedId("pay_ded"),
        companyId: context.companyId,
        payrollItemId: result.item.id,
        deductionType: deduction.deduction_type,
        amount: deduction.amount,
        sourceType: deduction.source_type,
        sourceId: deduction.source_id,
        notes: deduction.notes,
      });
    }
    for (const exception of result.exceptions) {
      await exceptionService.createPayrollException(env, {
        companyId: context.companyId,
        payrollRunId: runId,
        employeeId: exception.employee_id,
        outletId: exception.outlet_id,
        exceptionType: exception.exception_type,
        severity: exception.severity,
        message: exception.message,
      });
    }
  }

  await repository.updateRunTotals(env, context.companyId, runId, { gross, deductions, net });
  return repository.findRunById(env, context.companyId, runId);
};

export const calculatePayroll = async (env: Env, context: AuthActor, input: PayrollCalculateInput) => {
  await assertFullPayrollCalculationAccess(env, context, input);
  const existing = await repository.findRunByMonth(env, context.companyId, input.payroll_month);
  if (existing && !input.reason) throw new ConflictError("A reason is required to recalculate an existing payroll.");
  const run = await calculateRun(env, context, input);
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
  const blockers = await getPayrollSyncBlockers(env, context.companyId, payrollMonth);
  let syncBlocked = false;
  let attendanceBlocked = false;
  let longLeaveBlocked = false;
  if ((blockers.pending_sync_items ?? 0) > 0) {
    syncBlocked = true;
    await exceptionService.createPayrollException(env, {
      companyId: context.companyId,
      payrollRunId: runId,
      exceptionType: "pending_sync",
      severity: "critical",
      message: "Payroll cannot be finalized while attendance sync is pending.",
    });
  }
  if ((blockers.unresolved_sync_conflicts ?? 0) > 0) {
    syncBlocked = true;
    await exceptionService.createPayrollException(env, {
      companyId: context.companyId,
      payrollRunId: runId,
      exceptionType: "unresolved_sync_conflict",
      severity: "critical",
      message: "Payroll cannot be finalized while attendance sync conflicts are unresolved.",
    });
  }
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
  const payrollSettings = await settingsService.getPayrollSettings(env, context.companyId).catch(() => ({}));
  if ((payrollSettings as Record<string, unknown>).attendance_to_payroll_enabled === true) {
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
  const approvalRequestId = await approvalService.createApprovalRequest(env, context, {
    workflowKey: "payroll_finalization",
    module: "payroll",
    entityType: "payroll_run",
    entityId: id,
    summary: "Payroll run needs approval.",
    payload: { payroll_run_id: id, payroll_month: run.payroll_month },
  });
  if (!approvalRequestId) {
    await ensureAudit(env, context, {
      action: PAYROLL_AUDIT_ACTIONS.submittedForApproval,
      entityType: "payroll_run",
      entityId: id,
      reason: input.reason,
    });
    return { approval_required: false, message: "Approval workflows are disabled. Authorized users can approve directly." };
  }
  await repository.updateRunStatus(env, context.companyId, id, { status: "submitted" });
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.submittedForApproval,
    entityType: "payroll_run",
    entityId: id,
    reason: input.reason,
  });
  return { approval_request_id: approvalRequestId };
};

export const approvePayroll = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  const run = await ensureRun(env, context, id);
  lockService.assertPayrollRunEditable(run);
  if ((await repository.countOpenCriticalExceptions(env, context.companyId, id)) > 0) {
    throw new PayrollBlockedError("Payroll cannot be locked because there are unresolved exceptions.");
  }
  await repository.updateRunStatus(env, context.companyId, id, { status: "approved", approvedBy: context.actorUserId });
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
  await repository.updateRunStatus(env, context.companyId, id, { status: "rejected" });
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.rejected,
    entityType: "payroll_run",
    entityId: id,
    oldValue: run,
    newValue: { status: "rejected" },
    reason: input.reason,
  });
  return { rejected: true };
};

export const lockPayroll = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  const run = await ensureRun(env, context, id);
  lockService.assertPayrollRunEditable(run);
  await createBlockerExceptions(env, context, id, run.payroll_month);
  if ((await repository.countOpenCriticalExceptions(env, context.companyId, id)) > 0) {
    throw new PayrollBlockedError("Payroll cannot be locked because there are unresolved exceptions.");
  }
  if (run.status !== "approved") {
    throw new ConflictError("Payroll must be approved before it can be locked.");
  }
  await repository.lockRun(env, context.companyId, id, context.actorUserId);
  await repository.updateAttendancePayrollStatus(env, context.companyId, run.payroll_month, "locked");
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.locked,
    entityType: "payroll_run",
    entityId: id,
    oldValue: run,
    newValue: { status: "locked" },
    reason: input.reason,
  });
  await broadcast(env, context, "payroll.locked", { payroll_run_id: id });
  return { locked: true };
};

export const requestReopen = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  const run = await ensureRun(env, context, id);
  if (!["locked", "paid"].includes(run.status)) throw new ConflictError("Only locked payroll can be reopened.");
  const approvalRequestId = await approvalService.createApprovalRequest(env, context, {
    workflowKey: "payroll_reopen",
    module: "payroll",
    entityType: "payroll_run",
    entityId: id,
    summary: "Payroll reopen request needs approval.",
    payload: { payroll_run_id: id, payroll_month: run.payroll_month },
  });
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.reopenRequested,
    entityType: "payroll_run",
    entityId: id,
    reason: input.reason,
  });
  return { approval_request_id: approvalRequestId };
};

export const approveReopen = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  await ensureRun(env, context, id);
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.reopenApproved,
    entityType: "payroll_run",
    entityId: id,
    reason: input.reason,
  });
  return { approved: true };
};

export const reopenPayroll = async (env: Env, context: AuthActor, id: string, input: PayrollActionInput) => {
  await assertFullPayrollLifecycleAccess(env, context);
  const run = await ensureRun(env, context, id);
  if (!["locked", "paid"].includes(run.status)) throw new ConflictError("Only locked payroll can be reopened.");
  await repository.reopenRun(env, context.companyId, id);
  await repository.updateAttendancePayrollStatus(env, context.companyId, run.payroll_month, "pending");
  await ensureAudit(env, context, {
    action: PAYROLL_AUDIT_ACTIONS.reopened,
    entityType: "payroll_run",
    entityId: id,
    oldValue: run,
    newValue: { status: "reopened" },
    reason: input.reason,
  });
  await broadcast(env, context, "payroll.reopened", { payroll_run_id: id });
  return { reopened: true };
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
