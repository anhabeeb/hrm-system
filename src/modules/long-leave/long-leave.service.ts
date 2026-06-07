import {
  DEFAULT_LONG_LEAVE_TRIGGER_DAYS,
  LOCKED_PAYROLL_STATUSES,
  LONG_LEAVE_AUDIT_ACTIONS,
} from "./long-leave.constants";
import * as calculator from "./long-leave-calculator.service";
import * as repository from "./long-leave.repository";
import type {
  LongLeaveActionInput,
  LongLeaveCreateInput,
  LongLeaveFilters,
  LongLeaveImpactRecord,
  LongLeaveListResult,
  LongLeaveOverrideInput,
  LongLeaveReturnInput,
  LongLeaveRecord,
} from "./long-leave.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import { broadcastEvent } from "../../services/realtime.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import {
  AppError,
  ConflictError,
  LockedRecordError,
  NotFoundError,
  OutletAccessError,
  ValidationError,
} from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
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

const ensureAudit = async (
  env: Env,
  context: AuthActor,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    employeeId?: string;
    outletId?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: "long_leave",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId,
    actorId: context.actorUserId,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason ?? undefined,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  if (!result.created) {
    throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
  }
};

const broadcast = (env: Env, context: AuthActor, type: string, payload: Record<string, unknown>) =>
  broadcastEvent(env, {
    roomName: `company:${context.companyId}`,
    type,
    payload,
    triggeredBy: context.actorUserId,
  }).catch((error) => console.error("Long leave realtime event failed", error));

const ensureEmployeeAccess = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee) throw new NotFoundError("The requested employee could not be found.");
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }
  return employee;
};

const getRecord = async (env: Env, context: AuthActor, id: string) => {
  const record = await repository.findLongLeave(env, context.companyId, id);
  if (!record) throw new NotFoundError("Long leave record could not be found.");
  if (!permissionService.hasOutletAccess(context, record.outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }
  return record;
};

const assertPayrollMonthUnlocked = async (
  env: Env,
  companyId: string,
  payrollMonth: string,
  message = "This long leave affects a locked payroll period.",
) => {
  const payrollRun = await repository.findPayrollRunForMonth(env, companyId, payrollMonth);
  if (payrollRun && LOCKED_PAYROLL_STATUSES.includes(payrollRun.status as any)) {
    throw new LockedRecordError(message);
  }
};

const assertRecordPayrollUnlocked = async (env: Env, record: LongLeaveRecord) => {
  const endDate = record.actual_return_date ?? record.expected_return_date;
  for (const month of calculator.monthsBetween(record.start_date, endDate)) {
    await assertPayrollMonthUnlocked(env, record.company_id, month);
  }
};

const createApprovalRequestIfRequired = async (
  env: Env,
  context: AuthActor,
  record: LongLeaveRecord,
) => {
  const requiresApproval = await settingsService.shouldRequireApproval(
    env,
    context.companyId,
    "long_leave_request",
    context,
  );

  if (!requiresApproval) return null;

  const workflow = await repository.findApprovalWorkflow(
    env,
    context.companyId,
    "long_leave_request",
  );
  if (!workflow || workflow.is_enabled !== 1) {
    throw new ConflictError("Approval workflow is not configured for long leave requests.");
  }

  const approvalRequestId = createPrefixedId("approval_req");
  await repository.createApprovalRequest(env, {
    id: approvalRequestId,
    companyId: context.companyId,
    workflowId: workflow.id,
    module: "long_leave",
    entityType: "long_leave_record",
    entityId: record.id,
    employeeId: record.employee_id,
    requestedBy: context.actorUserId,
    summary: "Long leave request needs approval.",
    payloadJson: JSON.stringify({
      long_leave_record_id: record.id,
      employee_id: record.employee_id,
      start_date: record.start_date,
      expected_return_date: record.expected_return_date,
      total_days: record.total_days,
    }),
  });

  return approvalRequestId;
};

const upsertSalaryImpactPreview = async (
  env: Env,
  context: AuthActor,
  record: LongLeaveRecord & { outlet_id?: string | null },
) => {
  const rows = await calculator.calculateLongLeaveSalaryImpact(env, record);
  if (rows.some((row) => row.monthly_salary_amount <= 0)) {
    return {
      salary_impact_calculated: false,
      salary_impact_warning: "Salary impact requires salary history before it can be calculated.",
    };
  }

  for (const row of rows) {
    await assertPayrollMonthUnlocked(env, context.companyId, row.payroll_month);
  }

  for (const row of rows) {
    const existing = await repository.findImpactByMonth(
      env,
      context.companyId,
      record.id,
      row.payroll_month,
    );
    await repository.upsertImpact(env, {
      id: existing?.id ?? createPrefixedId("long_leave_impact"),
      company_id: context.companyId,
      employee_id: record.employee_id,
      long_leave_record_id: record.id,
      payroll_month: row.payroll_month,
      monthly_salary_amount: row.monthly_salary_amount,
      salary_calculation_days: row.salary_calculation_days,
      worked_days: row.worked_days,
      long_leave_days: row.long_leave_days,
      daily_salary_amount: row.daily_salary_amount,
      estimated_payable_amount: row.estimated_payable_amount,
      final_payable_amount: existing?.final_payable_amount ?? null,
      override_amount: existing?.override_amount ?? null,
      override_reason: existing?.override_reason ?? null,
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso(),
    });
  }

  return {
    salary_impact_calculated: true,
  };
};

export const listLongLeave = async (
  env: Env,
  context: AuthActor,
  filters: LongLeaveFilters,
): Promise<LongLeaveListResult<any>> => {
  const total = await repository.countLongLeave(env, context.companyId, filters, scope(context));
  return {
    rows: await repository.listLongLeave(env, context.companyId, filters, scope(context)),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getLongLeave = async (env: Env, context: AuthActor, id: string) => {
  const record = await getRecord(env, context, id);
  return {
    record,
    salary_impacts: await repository.listImpacts(env, context.companyId, id),
  };
};

export const createLongLeave = async (env: Env, context: AuthActor, input: LongLeaveCreateInput) => {
  const employee = await ensureEmployeeAccess(env, context, input.employee_id);
  if (employee.deleted_at || ["archived", "resigned", "terminated", "retired", "inactive"].includes(employee.employment_status)) {
    throw new ConflictError("This employee cannot be placed on long leave.");
  }
  const totalDays = calculator.countInclusiveDays(input.start_date, input.expected_return_date);
  const settings = await repository.getLongLeaveSettings(env, context.companyId);
  const triggerDays = settings?.trigger_days ?? DEFAULT_LONG_LEAVE_TRIGGER_DAYS;
  if (totalDays < triggerDays && !input.allow_short_leave_override && !permissionService.hasPermission(context, "long_leave.override")) {
    throw new ValidationError("This leave does not meet the long leave trigger days.");
  }
  const id = createPrefixedId("long_leave");
  const record: LongLeaveRecord = {
    id,
    company_id: context.companyId,
    employee_id: input.employee_id,
    leave_request_id: input.leave_request_id,
    start_date: input.start_date,
    expected_return_date: input.expected_return_date,
    actual_return_date: null,
    total_days: totalDays,
    status: "pending",
    salary_impact_confirmed: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await repository.createLongLeave(env, record);
  await createApprovalRequestIfRequired(env, context, record);
  const salaryImpactResult = await upsertSalaryImpactPreview(env, context, {
    ...record,
    outlet_id: employee.primary_outlet_id,
  }).catch((error) => {
    if (error instanceof LockedRecordError) {
      return {
        salary_impact_calculated: false,
        salary_impact_warning:
          "Salary impact could not be calculated because one or more payroll periods are locked.",
      };
    }
    throw error;
  });
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.created,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: input.employee_id,
    outletId: employee.primary_outlet_id,
    newValue: record,
    reason: input.reason,
  });
  await broadcast(env, context, "long_leave.created", { id, employee_id: input.employee_id });
  return {
    long_leave: await repository.findLongLeave(env, context.companyId, id),
    ...salaryImpactResult,
  };
};

export const getSalaryImpact = async (env: Env, context: AuthActor, id: string) => {
  await getRecord(env, context, id);
  return repository.listImpacts(env, context.companyId, id);
};

export const calculateSalaryImpact = async (env: Env, context: AuthActor, id: string) => {
  const record = await getRecord(env, context, id);
  const rows = await calculator.calculateLongLeaveSalaryImpact(env, record);
  for (const row of rows) {
    await assertPayrollMonthUnlocked(env, context.companyId, row.payroll_month);
  }
  for (const row of rows) {
    const existing = await repository.findImpactByMonth(env, context.companyId, id, row.payroll_month);
    const impact: LongLeaveImpactRecord = {
      id: existing?.id ?? createPrefixedId("long_leave_impact"),
      company_id: context.companyId,
      employee_id: record.employee_id,
      long_leave_record_id: id,
      payroll_month: row.payroll_month,
      monthly_salary_amount: row.monthly_salary_amount,
      salary_calculation_days: row.salary_calculation_days,
      worked_days: row.worked_days,
      long_leave_days: row.long_leave_days,
      daily_salary_amount: row.daily_salary_amount,
      estimated_payable_amount: row.estimated_payable_amount,
      final_payable_amount: existing?.final_payable_amount ?? null,
      override_amount: existing?.override_amount ?? null,
      override_reason: existing?.override_reason ?? null,
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso(),
    };
    await repository.upsertImpact(env, impact);
  }
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.salaryImpactCalculated,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    newValue: rows,
  });
  await broadcast(env, context, "long_leave.salary_impact_calculated", { id });
  return { months: await repository.listImpacts(env, context.companyId, id) };
};

export const confirmSalaryImpact = async (env: Env, context: AuthActor, id: string, input: LongLeaveActionInput) => {
  const record = await getRecord(env, context, id);
  const impacts = await repository.listImpacts(env, context.companyId, id);
  if (impacts.length === 0) throw new ConflictError("Salary impact must be calculated before confirmation.");
  await repository.updateLongLeave(env, context.companyId, id, { salary_impact_confirmed: 1 });
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.salaryImpactConfirmed,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    oldValue: { salary_impact_confirmed: record.salary_impact_confirmed },
    newValue: { salary_impact_confirmed: 1 },
    reason: input.reason,
  });
  return { confirmed: true };
};

export const approveLongLeave = async (env: Env, context: AuthActor, id: string, input: LongLeaveActionInput) => {
  const record = await getRecord(env, context, id);
  if (record.status !== "pending") throw new ConflictError("Only pending long leave can be approved.");
  const existingImpacts = await repository.listImpacts(env, context.companyId, id);
  if (existingImpacts.length === 0) {
    await calculateSalaryImpact(env, context, id);
  }
  const settings = await repository.getLongLeaveSettings(env, context.companyId);
  if ((settings?.require_salary_impact_preview ?? 1) === 1 && record.salary_impact_confirmed !== 1) {
    throw new ConflictError("Please confirm the long leave salary impact before approval.");
  }
  await assertRecordPayrollUnlocked(env, record);
  await repository.updateLongLeave(env, context.companyId, id, { status: "approved" });
  const employee = await ensureEmployeeAccess(env, context, record.employee_id);
  if (record.start_date <= new Date().toISOString().slice(0, 10) && employee.employment_status !== "long_leave") {
    await repository.updateEmployeeStatus(env, context.companyId, record.employee_id, "long_leave", context.actorUserId);
    await repository.createEmployeeStatusHistory(env, context.companyId, record.employee_id, employee.employment_status, "long_leave", input.reason, context.actorUserId);
  }
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.approved,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    oldValue: record,
    newValue: { status: "approved" },
    reason: input.reason,
  });
  await broadcast(env, context, "long_leave.approved", { id, employee_id: record.employee_id });
  return { approved: true };
};

export const rejectLongLeave = async (env: Env, context: AuthActor, id: string, input: LongLeaveActionInput) => {
  const record = await getRecord(env, context, id);
  if (record.status !== "pending") throw new ConflictError("Only pending long leave can be rejected.");
  await repository.updateLongLeave(env, context.companyId, id, { status: "rejected" });
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.rejected,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    oldValue: record,
    newValue: { status: "rejected" },
    reason: input.reason,
  });
  return { rejected: true };
};

export const returnFromLongLeave = async (env: Env, context: AuthActor, id: string, input: LongLeaveReturnInput) => {
  const record = await getRecord(env, context, id);
  if (input.actual_return_date < record.start_date) throw new ValidationError("Return date must be after the long leave start date.");
  const updatedRecord = { ...record, actual_return_date: input.actual_return_date };
  await assertRecordPayrollUnlocked(env, updatedRecord);
  await repository.updateLongLeave(env, context.companyId, id, {
    status: "returned",
    actual_return_date: input.actual_return_date,
  });
  const employee = await ensureEmployeeAccess(env, context, record.employee_id);
  if (employee.employment_status === "long_leave") {
    await repository.updateEmployeeStatus(env, context.companyId, record.employee_id, "active", context.actorUserId);
    await repository.createEmployeeStatusHistory(env, context.companyId, record.employee_id, "long_leave", "active", input.reason, context.actorUserId);
  }
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.returned,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    oldValue: record,
    newValue: { status: "returned", actual_return_date: input.actual_return_date },
    reason: input.reason,
  });
  await broadcast(env, context, "long_leave.returned", { id, employee_id: record.employee_id });
  return { returned: true };
};

export const overrideImpact = async (env: Env, context: AuthActor, id: string, input: LongLeaveOverrideInput) => {
  const record = await getRecord(env, context, id);
  await assertPayrollMonthUnlocked(env, context.companyId, input.payroll_month);
  const impact = await repository.findImpactByMonth(env, context.companyId, id, input.payroll_month);
  if (!impact) throw new NotFoundError("Long leave salary impact could not be found.");
  await repository.updateImpactOverride(env, context.companyId, id, input.payroll_month, input.override_amount, input.reason);
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.overrideSaved,
    entityType: "long_leave_salary_impact",
    entityId: impact.id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    oldValue: impact,
    newValue: { override_amount: input.override_amount, override_reason: input.reason },
    reason: input.reason,
  });
  return { updated: true };
};

export const settingsPreview = async (env: Env, context: AuthActor) => ({
  settings: await repository.getLongLeaveSettings(env, context.companyId),
});
