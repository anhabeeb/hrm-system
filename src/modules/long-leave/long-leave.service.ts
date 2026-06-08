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
  LongLeaveExtendInput,
  LongLeaveFilters,
  LongLeaveImpactRecord,
  LongLeaveListResult,
  LongLeaveOverrideInput,
  LongLeavePayrollImpactRecord,
  LongLeaveReturnInput,
  LongLeaveRecord,
  LongLeaveSettings,
  LongLeaveSettingsInput,
  LongLeaveUpdateInput,
} from "./long-leave.types";
import { createAuditLog } from "../../services/audit.service";
import { safeNotifyResolvedRecipients } from "../../services/notification.service";
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
const today = () => new Date().toISOString().slice(0, 10);

const defaultSettings = () => ({
  is_enabled: 1,
  applies_to_foreigners: 1,
  applies_to_locals: 0,
  trigger_days: DEFAULT_LONG_LEAVE_TRIGGER_DAYS,
  max_continuous_days: null as number | null,
  salary_rule: "pay_only_worked_days",
  require_salary_impact_preview: 1,
  pay_only_worked_days: 1,
  deduct_full_salary_if_zero_worked_days: 1,
  count_holidays_inside_leave: 1,
  pay_holidays_during_long_leave: 0,
  pay_weekly_off_days_during_long_leave: 0,
  allow_hr_override: 1,
  default_salary_treatment: "unpaid",
  default_deduction_method: "calendar_days",
  require_payroll_review: 1,
  require_return_to_work_confirmation: 1,
  approval_required: 1,
  partial_pay_ratio: 0.5,
});
const getSettings = async (env: Env, companyId: string) =>
  ({ ...defaultSettings(), ...((await repository.getLongLeaveSettings(env, companyId)) ?? {}) }) as LongLeaveSettings;

const derivePayableDaysPolicy = (settings: LongLeaveSettings, explicitPolicy?: string | null) =>
  explicitPolicy === "pay_only_worked_days" || explicitPolicy === "monthly_deduction"
    ? explicitPolicy
    : settings.salary_rule === "pay_only_worked_days" || settings.salary_rule === "monthly_deduction"
      ? settings.salary_rule
      : settings.pay_only_worked_days === 1
        ? "pay_only_worked_days"
        : "monthly_deduction";

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

const notifyLongLeaveEvent = (
  env: Env,
  context: AuthActor,
  event: string,
  record: Pick<LongLeaveRecord, "id" | "employee_id" | "start_date" | "expected_return_date" | "total_days" | "created_by"> & { outlet_id?: string | null },
  input: { title: string; message: string; priority?: "low" | "normal" | "high" | "urgent"; targetUserIds?: string[]; targetPermissionKeys?: string[]; targetRoleKeys?: string[] },
) =>
  safeNotifyResolvedRecipients(
    env,
    context.companyId,
    {
      userIds: input.targetUserIds,
      permissionKeys: input.targetPermissionKeys,
      roleKeys: input.targetRoleKeys,
      outletId: record.outlet_id,
      fallbackToAdmins: true,
    },
    {
      notification_type: event,
      category: "long_leave",
      priority: input.priority ?? "normal",
      title: input.title,
      message: input.message,
      action_url: `/long-leave?id=${encodeURIComponent(record.id)}`,
      action_label: "Open long leave",
      entity_type: "long_leave_record",
      entity_id: record.id,
      event_key: event,
      idempotency_key: `${event}:${record.id}`,
      outlet_id: record.outlet_id,
      recipient_employee_id: record.employee_id,
      metadata: {
        employee_id: record.employee_id,
        start_date: record.start_date,
        expected_return_date: record.expected_return_date,
        total_days: record.total_days,
      },
    },
    { actorId: context.actorUserId, excludeActor: true, requestId: context.requestId },
  );

const ensureEmployeeAccess = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee) throw new NotFoundError("The requested employee could not be found.");
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }
  return employee;
};

const isForeignEmployee = (employee: { employee_type?: string | null }) =>
  ["foreign", "foreign_worker", "expatriate", "work_permit"].includes(String(employee.employee_type ?? "").toLowerCase());

const assertEligibleForLongLeave = async (
  env: Env,
  context: AuthActor,
  employee: Awaited<ReturnType<typeof ensureEmployeeAccess>>,
  input: Pick<LongLeaveCreateInput, "start_date" | "expected_return_date" | "allow_local_override" | "allow_short_leave_override" | "leave_request_id">,
  excludeId?: string,
) => {
  const settings = await getSettings(env, context.companyId);
  if (settings.is_enabled === 0) throw new AppError("Long leave is disabled for this company.", "LONG_LEAVE_POLICY_NOT_FOUND", 409);
  if (employee.deleted_at || ["archived", "resigned", "terminated", "retired", "inactive"].includes(employee.employment_status)) {
    throw new AppError("This employee cannot start a future long leave.", "LONG_LEAVE_EMPLOYEE_INELIGIBLE", 409);
  }
  const joinDate = employee.date_of_joining ?? employee.hire_date ?? employee.joined_at;
  if (joinDate && input.start_date < joinDate) {
    throw new AppError("Long leave cannot start before the employee join date.", "LONG_LEAVE_INVALID_DATE_RANGE", 400);
  }
  const foreign = isForeignEmployee(employee);
  const localOverrideAllowed = settings.applies_to_locals === 1 || (input.allow_local_override && permissionService.hasPermission(context, "long_leave.override"));
  if (!foreign && !localOverrideAllowed) {
    throw new AppError("Foreign long leave is only available for foreign employees.", "LONG_LEAVE_NOT_FOREIGN_EMPLOYEE", 403);
  }
  const totalDays = calculator.countInclusiveDays(input.start_date, input.expected_return_date);
  if (totalDays < settings.trigger_days && !input.allow_short_leave_override && !permissionService.hasPermission(context, "long_leave.override")) {
    throw new AppError("This leave is below the long leave minimum. Please create a normal leave request instead.", "LONG_LEAVE_DURATION_TOO_SHORT", 400);
  }
  if (settings.max_continuous_days && totalDays > settings.max_continuous_days && !permissionService.hasPermission(context, "long_leave.override")) {
    throw new AppError("This long leave exceeds the configured maximum duration.", "LONG_LEAVE_INVALID_DATE_RANGE", 400);
  }
  if (input.start_date < today() && !permissionService.hasPermission(context, "long_leave.override")) {
    throw new AppError("Backdated long leave requires override permission.", "LONG_LEAVE_BACKDATE_NOT_ALLOWED", 403);
  }
  const overlap = await repository.findOverlappingLongLeave(env, context.companyId, employee.id, input.start_date, input.expected_return_date, excludeId);
  if (overlap) throw new AppError("This employee already has overlapping long leave.", "LONG_LEAVE_OVERLAP_EXISTS", 409);
  if (!input.leave_request_id) {
    const normalLeave = await repository.findOverlappingNormalLeave(env, context.companyId, employee.id, input.start_date, input.expected_return_date);
    if (normalLeave) throw new AppError("This long leave overlaps an existing leave request.", "LONG_LEAVE_OVERLAP_EXISTS", 409);
  }
  for (const month of calculator.monthsBetween(input.start_date, input.expected_return_date)) {
    try {
      await assertPayrollMonthUnlocked(env, context.companyId, month, "Long leave cannot affect a finalized payroll period.");
    } catch (error) {
      if (!permissionService.hasPermission(context, "long_leave.override")) {
        throw new AppError("This long leave overlaps a closed payroll period.", "LONG_LEAVE_CLOSED_PAYROLL_PERIOD", 423);
      }
    }
  }
  return { settings, totalDays };
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
  const existing = await repository.findApprovalRequestForLongLeave(env, context.companyId, record.id);
  if (existing && ["pending", "in_progress", "approved", "completed"].includes(existing.status)) return existing.id;

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

const syncApprovalRequest = async (env: Env, context: AuthActor, record: LongLeaveRecord, status: string, reason?: string | null) => {
  await repository.updateApprovalRequestsForLongLeave(env, context.companyId, record.id, status);
  await ensureAudit(env, context, {
    action: "long_leave_generic_approval_synced",
    entityType: "approval_request",
    entityId: record.id,
    employeeId: record.employee_id,
    outletId: (record as any).outlet_id,
    newValue: { status },
    reason,
  });
};

const assertApprovalWorkflowAllowsDirectAction = async (
  env: Env,
  context: AuthActor,
  record: LongLeaveRecord,
  input: LongLeaveActionInput,
) => {
  const approvalRequest = await repository.findApprovalRequestForLongLeave(env, context.companyId, record.id);
  if (!approvalRequest || ["approved", "completed"].includes(approvalRequest.status)) return;
  const canOverride = permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "long_leave.override");
  if (!canOverride) {
    throw new AppError(
      "This long leave must be completed through the configured approval workflow.",
      "LONG_LEAVE_APPROVAL_REQUIRED",
      409,
    );
  }
  if (!input.reason?.trim()) {
    throw new AppError("Super Admin override requires a reason.", "LONG_LEAVE_APPROVAL_REASON_REQUIRED", 400);
  }
  await ensureAudit(env, context, {
    action: "long_leave_super_admin_override",
    entityType: "long_leave_record",
    entityId: record.id,
    employeeId: record.employee_id,
    outletId: (record as any).outlet_id,
    newValue: { approval_request_status: approvalRequest.status },
    reason: input.reason,
  });
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
  const { totalDays, settings } = await assertEligibleForLongLeave(env, context, employee, input);
  const requiresApproval = settings.approval_required === 0 ? false : await settingsService.shouldRequireApproval(env, context.companyId, "long_leave_request", context);
  const id = createPrefixedId("long_leave");
  const timestamp = nowIso();
  const record: LongLeaveRecord = {
    id,
    company_id: context.companyId,
    employee_id: input.employee_id,
    leave_request_id: input.leave_request_id || null,
    start_date: input.start_date,
    expected_return_date: input.expected_return_date,
    actual_return_date: null,
    total_days: totalDays,
    status: requiresApproval ? "pending_approval" : "approved",
    approval_status: requiresApproval ? "pending" : "approved",
    payroll_status: "not_started",
    salary_treatment: input.salary_treatment ?? settings.default_salary_treatment ?? "unpaid",
    deduction_method: input.deduction_method ?? settings.default_deduction_method ?? "calendar_days",
    payable_days_policy: derivePayableDaysPolicy(settings, input.payable_days_policy),
    reason: input.reason,
    notes: input.notes ?? null,
    created_by: context.actorUserId,
    submitted_by: context.actorUserId,
    submitted_at: timestamp,
    salary_impact_confirmed: 0,
    created_at: timestamp,
    updated_at: timestamp,
  };
  await repository.createLongLeave(env, record);
  if (requiresApproval) await createApprovalRequestIfRequired(env, context, record);
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
  void notifyLongLeaveEvent(env, context, requiresApproval ? "long_leave_submitted" : "long_leave_approved", { ...record, outlet_id: employee.primary_outlet_id }, requiresApproval
    ? {
        title: "Long leave needs approval",
        message: "A long leave request has been submitted for review.",
        priority: "high",
        targetPermissionKeys: ["long_leave.approve"],
        targetRoleKeys: ["hr_admin", "admin"],
      }
    : {
        title: "Long leave approved",
        message: "A long leave record was approved.",
        targetUserIds: [record.created_by ?? context.actorUserId],
      });
  return {
    long_leave: await repository.findLongLeave(env, context.companyId, id),
    ...salaryImpactResult,
  };
};

export const updateLongLeaveRecord = async (env: Env, context: AuthActor, id: string, input: LongLeaveUpdateInput) => {
  const record = await getRecord(env, context, id);
  if (!["draft", "pending", "pending_approval", "submitted"].includes(record.status)) {
    throw new AppError("Only draft or pending long leave can be edited.", "LONG_LEAVE_EMPLOYEE_INELIGIBLE", 409);
  }
  const employee = await ensureEmployeeAccess(env, context, record.employee_id);
  const nextStart = input.start_date ?? record.start_date;
  const nextReturn = input.expected_return_date ?? record.expected_return_date;
  const { totalDays } = await assertEligibleForLongLeave(env, context, employee, {
    leave_request_id: record.leave_request_id ?? "",
    start_date: nextStart,
    expected_return_date: nextReturn,
    allow_short_leave_override: true,
  }, record.id);
  const settings = await getSettings(env, context.companyId);
  await repository.updateLongLeave(env, context.companyId, id, {
    start_date: nextStart,
    expected_return_date: nextReturn,
    total_days: totalDays,
    notes: input.notes ?? record.notes,
    salary_treatment: input.salary_treatment ?? record.salary_treatment,
    deduction_method: input.deduction_method ?? record.deduction_method,
    payable_days_policy: input.payable_days_policy ? derivePayableDaysPolicy(settings, input.payable_days_policy) : record.payable_days_policy,
    payroll_status: "pending_review",
  });
  await ensureAudit(env, context, {
    action: "long_leave_updated",
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    oldValue: record,
    newValue: { start_date: nextStart, expected_return_date: nextReturn, total_days: totalDays },
    reason: input.reason,
  });
  return { updated: true, long_leave: await repository.findLongLeave(env, context.companyId, id) };
};

export const getSalaryImpact = async (env: Env, context: AuthActor, id: string) => {
  await getRecord(env, context, id);
  return repository.listImpacts(env, context.companyId, id);
};

const previewRowsToPayrollImpacts = async (
  env: Env,
  record: LongLeaveRecord & { outlet_id?: string | null },
  actorId: string | null,
) => {
  const rows = await calculator.calculateLongLeavePayrollPreview(env, record);
  const calculatedAt = nowIso();
  const impacts: LongLeavePayrollImpactRecord[] = [];
  for (const row of rows) {
    const existing = await repository.findPayrollImpactByMonth(env, record.company_id, record.id, row.payroll_month);
    let status = row.status === "blocked" ? "blocked" : "pending_review";
    let warningCode = row.warning_code ?? null;
    let warningMessage = row.warning_message ?? null;
    const payrollRun = await repository.findPayrollRunForMonth(env, record.company_id, row.payroll_month);
    if (payrollRun && LOCKED_PAYROLL_STATUSES.includes(payrollRun.status as any)) {
      status = "blocked";
      warningCode = "LONG_LEAVE_PAYROLL_PERIOD_CLOSED";
      warningMessage = "This payroll period is closed/finalized and cannot be adjusted.";
    }
    impacts.push({
      id: existing?.id ?? createPrefixedId("long_leave_payroll_impact"),
      company_id: record.company_id,
      long_leave_id: record.id,
      employee_id: record.employee_id,
      payroll_month: row.payroll_month,
      period_start: `${row.payroll_month}-01`,
      period_end: calculator.monthEndDate(row.payroll_month),
      base_salary: row.monthly_salary_amount,
      total_days: row.total_days ?? 0,
      long_leave_days: row.long_leave_days,
      holiday_days: row.holiday_days ?? 0,
      payable_holiday_days: row.payable_holiday_days ?? 0,
      payable_days: row.payable_days ?? 0,
      unpaid_days: row.unpaid_days ?? row.long_leave_days,
      per_day_rate: row.daily_salary_amount,
      deduction_amount: row.deduction_amount ?? 0,
      payable_salary: row.payable_salary ?? row.estimated_payable_amount,
      status: existing?.status === "applied" ? "applied" : status,
      payroll_run_id: null,
      payroll_adjustment_id: null,
      calculated_at: calculatedAt,
      applied_at: existing?.applied_at ?? null,
      applied_by: existing?.applied_by ?? null,
      idempotency_key: `long_leave:${record.id}:${row.payroll_month}`,
      notes: warningMessage,
      metadata_json: JSON.stringify({ warning_code: warningCode, source: "long_leave_payroll_preview" }),
      warning_code: warningCode,
      warning_message: warningMessage,
      created_at: existing?.created_at ?? calculatedAt,
      updated_at: calculatedAt,
    });
  }
  void env;
  void actorId;
  return impacts;
};

export const previewPayrollImpact = async (env: Env, context: AuthActor, id: string) => {
  const record = await getRecord(env, context, id);
  const impacts = await previewRowsToPayrollImpacts(env, record, context.actorUserId);
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.payrollPreviewGenerated,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    newValue: { months: impacts.length },
  });
  return {
    months: impacts,
    totals: {
      long_leave_days: impacts.reduce((sum, row) => sum + Number(row.long_leave_days), 0),
      deduction_amount: impacts.reduce((sum, row) => sum + Number(row.deduction_amount), 0),
      payable_salary: impacts.reduce((sum, row) => sum + Number(row.payable_salary), 0),
    },
    warnings: impacts.filter((row) => row.status === "blocked").map((row) => ({ payroll_month: row.payroll_month, message: row.notes })),
    generated_at: nowIso(),
  };
};

export const applyPayrollImpact = async (env: Env, context: AuthActor, id: string, input: LongLeaveActionInput) => {
  const record = await getRecord(env, context, id);
  const impacts = await previewRowsToPayrollImpacts(env, record, context.actorUserId);
  if (impacts.some((row) => row.status === "blocked")) {
    await ensureAudit(env, context, {
      action: LONG_LEAVE_AUDIT_ACTIONS.payrollImpactBlocked,
      entityType: "long_leave_record",
      entityId: id,
      employeeId: record.employee_id,
      outletId: record.outlet_id,
      newValue: impacts.filter((row) => row.status === "blocked"),
      reason: input.reason,
    });
    throw new AppError("Long leave payroll impact includes blocked payroll periods.", "LONG_LEAVE_PAYROLL_PERIOD_CLOSED", 423);
  }
  for (const impact of impacts) {
    await repository.upsertPayrollImpact(env, {
      ...impact,
      status: impact.payroll_adjustment_id ? "applied" : "pending_review",
      notes: impact.notes ?? "Payroll impact is stored for payroll review; no payroll run was mutated.",
    });
  }
  await repository.updateLongLeave(env, context.companyId, id, { payroll_status: "pending_review" });
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.payrollImpactApplied,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    newValue: { months: impacts.length, idempotency_keys: impacts.map((row) => row.idempotency_key) },
    reason: input.reason,
  });
  void notifyLongLeaveEvent(env, context, "long_leave_payroll_review_required", record as any, {
    title: "Long leave payroll review required",
    message: "Long leave payroll impact was stored for review. No payroll run was changed.",
    priority: "high",
    targetPermissionKeys: ["long_leave.payroll_apply", "payroll.review"],
    targetRoleKeys: ["accountant", "admin"],
  });
  return {
    applied: false,
    review_recorded: true,
    message: "Long leave payroll impact was stored for review. No payroll run or finalized payroll deduction was mutated.",
    months: await repository.listPayrollImpacts(env, context.companyId, id),
  };
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
  if (["approved", "active"].includes(record.status)) return { approved: true, already_applied: true };
  if (!["pending", "submitted", "pending_approval"].includes(record.status)) throw new ConflictError("Only pending long leave can be approved.");
  await assertApprovalWorkflowAllowsDirectAction(env, context, record, input);
  const existingImpacts = await repository.listImpacts(env, context.companyId, id);
  if (existingImpacts.length === 0) {
    await calculateSalaryImpact(env, context, id);
  }
  const settings = await repository.getLongLeaveSettings(env, context.companyId);
  if ((settings?.require_salary_impact_preview ?? 1) === 1 && record.salary_impact_confirmed !== 1) {
    throw new ConflictError("Please confirm the long leave salary impact before approval.");
  }
  await assertRecordPayrollUnlocked(env, record);
  await repository.updateLongLeave(env, context.companyId, id, {
    status: "approved",
    approval_status: "approved",
    approved_by: context.actorUserId,
    approved_at: nowIso(),
  });
  await syncApprovalRequest(env, context, record, "approved", input.reason);
  const employee = await ensureEmployeeAccess(env, context, record.employee_id);
  if (record.start_date <= today() && employee.employment_status !== "long_leave") {
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
  void notifyLongLeaveEvent(env, context, "long_leave_approved", record as any, {
    title: "Long leave approved",
    message: "A long leave request was approved.",
    targetUserIds: [record.created_by ?? record.submitted_by ?? record.employee_id],
  });
  return { approved: true };
};

export const rejectLongLeave = async (env: Env, context: AuthActor, id: string, input: LongLeaveActionInput) => {
  const record = await getRecord(env, context, id);
  if (record.status === "rejected") return { rejected: true, already_applied: true };
  if (!["pending", "submitted", "pending_approval"].includes(record.status)) throw new ConflictError("Only pending long leave can be rejected.");
  await repository.updateLongLeave(env, context.companyId, id, { status: "rejected", approval_status: "rejected", rejected_by: context.actorUserId, rejected_at: nowIso() });
  await syncApprovalRequest(env, context, record, "rejected", input.reason);
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
  void notifyLongLeaveEvent(env, context, "long_leave_rejected", record as any, {
    title: "Long leave rejected",
    message: "A long leave request was rejected. Open it to review the reason.",
    priority: "high",
    targetUserIds: [record.created_by ?? record.submitted_by ?? ""],
  });
  return { rejected: true };
};

export const submitLongLeave = async (env: Env, context: AuthActor, id: string, input: LongLeaveActionInput) => {
  const record = await getRecord(env, context, id);
  if (["pending", "pending_approval", "submitted", "approved"].includes(record.status)) return { submitted: true, already_applied: true };
  if (record.status !== "draft") throw new AppError("Only draft long leave can be submitted.", "LONG_LEAVE_INVALID_DATE_RANGE", 409);
  const employee = await ensureEmployeeAccess(env, context, record.employee_id);
  await assertEligibleForLongLeave(env, context, employee, {
    leave_request_id: record.leave_request_id ?? "",
    start_date: record.start_date,
    expected_return_date: record.expected_return_date,
  }, record.id);
  const settings = await getSettings(env, context.companyId);
  const requiresApproval = settings.approval_required === 0 ? false : await settingsService.shouldRequireApproval(env, context.companyId, "long_leave_request", context);
  await repository.updateLongLeave(env, context.companyId, id, {
    status: requiresApproval ? "pending_approval" : "approved",
    approval_status: requiresApproval ? "pending" : "approved",
    submitted_by: context.actorUserId,
    submitted_at: nowIso(),
  });
  if (requiresApproval) {
    await createApprovalRequestIfRequired(env, context, record);
  } else {
    await syncApprovalRequest(env, context, record, "approved", input.reason);
  }
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.submitted,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    reason: input.reason,
  });
  void notifyLongLeaveEvent(env, context, "long_leave_submitted", record as any, {
    title: "Long leave needs approval",
    message: "A long leave request has been submitted for review.",
    priority: "high",
    targetPermissionKeys: ["long_leave.approve"],
    targetRoleKeys: ["hr_admin", "admin"],
  });
  return { submitted: true };
};

export const cancelLongLeave = async (env: Env, context: AuthActor, id: string, input: LongLeaveActionInput) => {
  const record = await getRecord(env, context, id);
  if (record.status === "cancelled") return { cancelled: true, already_applied: true };
  await assertRecordPayrollUnlocked(env, record);
  await repository.updateLongLeave(env, context.companyId, id, {
    status: "cancelled",
    approval_status: "cancelled",
    payroll_status: record.payroll_status === "payroll_adjusted" ? "partially_adjusted" : record.payroll_status,
    cancelled_by: context.actorUserId,
    cancelled_at: nowIso(),
    cancel_reason: input.reason,
  });
  await syncApprovalRequest(env, context, record, "cancelled", input.reason);
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.cancelled,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    oldValue: record,
    newValue: { status: "cancelled" },
    reason: input.reason,
  });
  void notifyLongLeaveEvent(env, context, "long_leave_cancelled", record as any, {
    title: "Long leave cancelled",
    message: "A long leave record was cancelled.",
    targetUserIds: [record.created_by ?? record.submitted_by ?? ""],
    targetPermissionKeys: ["long_leave.view"],
  });
  return { cancelled: true };
};

export const extendLongLeave = async (env: Env, context: AuthActor, id: string, input: LongLeaveExtendInput) => {
  const record = await getRecord(env, context, id);
  if (!["approved", "active", "extended", "pending_approval"].includes(record.status)) {
    throw new AppError("Only active or pending long leave can be extended.", "LONG_LEAVE_INVALID_DATE_RANGE", 409);
  }
  if (input.new_expected_return_date <= record.expected_return_date) {
    throw new AppError("The new return date must be after the current expected return date.", "LONG_LEAVE_INVALID_DATE_RANGE", 400);
  }
  const employee = await ensureEmployeeAccess(env, context, record.employee_id);
  const { totalDays } = await assertEligibleForLongLeave(env, context, employee, {
    leave_request_id: record.leave_request_id ?? "",
    start_date: record.start_date,
    expected_return_date: input.new_expected_return_date,
    allow_short_leave_override: true,
  }, record.id);
  const existingPayrollImpacts = await repository.listPayrollImpacts(env, context.companyId, id);
  const requiresReview = existingPayrollImpacts.some((impact) => ["applied", "reviewed", "pending_review"].includes(impact.status));
  await repository.updateLongLeave(env, context.companyId, id, {
    status: "extended",
    expected_return_date_original: record.expected_return_date_original ?? record.expected_return_date,
    expected_return_date: input.new_expected_return_date,
    total_days: totalDays,
    payroll_status: requiresReview ? "pending_review" : "not_started",
  });
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.extended,
    entityType: "long_leave_record",
    entityId: id,
    employeeId: record.employee_id,
    outletId: record.outlet_id,
    oldValue: { expected_return_date: record.expected_return_date },
    newValue: { expected_return_date: input.new_expected_return_date },
    reason: input.reason,
  });
  void notifyLongLeaveEvent(env, context, "long_leave_extended", { ...record, expected_return_date: input.new_expected_return_date, total_days: totalDays } as any, {
    title: "Long leave extended",
    message: "A long leave period was extended and may require payroll review.",
    priority: "high",
    targetPermissionKeys: ["long_leave.payroll_preview", "long_leave.approve"],
  });
  return { extended: true, payroll_preview: await previewPayrollImpact(env, context, id) };
};

export const returnFromLongLeave = async (env: Env, context: AuthActor, id: string, input: LongLeaveReturnInput) => {
  const record = await getRecord(env, context, id);
  if (input.actual_return_date < record.start_date) throw new ValidationError("Return date must be after the long leave start date.");
  const updatedRecord = { ...record, actual_return_date: input.actual_return_date };
  await assertRecordPayrollUnlocked(env, updatedRecord);
  const existingPayrollImpacts = await repository.listPayrollImpacts(env, context.companyId, id);
  const requiresReview = existingPayrollImpacts.some((impact) => ["applied", "reviewed", "pending_review"].includes(impact.status));
  await repository.updateLongLeave(env, context.companyId, id, {
    status: "returned",
    actual_return_date: input.actual_return_date,
    returned_by: context.actorUserId,
    returned_at: nowIso(),
    return_notes: input.return_notes ?? input.reason,
    payroll_status: requiresReview ? "pending_review" : record.payroll_status,
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
  void notifyLongLeaveEvent(env, context, "long_leave_returned", record as any, {
    title: "Employee returned from long leave",
    message: "A long leave return has been recorded and may require payroll review.",
    targetPermissionKeys: ["long_leave.payroll_preview", "payroll.review"],
  });
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
  settings: await getSettings(env, context.companyId),
});

export const updateSettings = async (env: Env, context: AuthActor, input: LongLeaveSettingsInput) => {
  const current = await getSettings(env, context.companyId);
  const next: LongLeaveSettings = {
    ...current,
    is_enabled: input.is_enabled === undefined ? current.is_enabled : Number(input.is_enabled),
    applies_to_foreigners: input.applies_to_foreigners === undefined ? current.applies_to_foreigners : Number(input.applies_to_foreigners),
    applies_to_locals: input.applies_to_locals === undefined ? current.applies_to_locals : Number(input.applies_to_locals),
    trigger_days: input.trigger_days ?? current.trigger_days,
    max_continuous_days: input.max_continuous_days === undefined ? current.max_continuous_days : input.max_continuous_days,
    salary_rule: input.salary_rule ?? current.salary_rule,
    require_salary_impact_preview: input.require_salary_impact_preview === undefined ? current.require_salary_impact_preview : Number(input.require_salary_impact_preview),
    pay_only_worked_days: input.pay_only_worked_days === undefined ? current.pay_only_worked_days : Number(input.pay_only_worked_days),
    deduct_full_salary_if_zero_worked_days: input.deduct_full_salary_if_zero_worked_days === undefined ? current.deduct_full_salary_if_zero_worked_days : Number(input.deduct_full_salary_if_zero_worked_days),
    count_holidays_inside_leave: input.count_holidays_inside_leave === undefined ? current.count_holidays_inside_leave : Number(input.count_holidays_inside_leave),
    pay_holidays_during_long_leave: input.pay_holidays_during_long_leave === undefined ? current.pay_holidays_during_long_leave : Number(input.pay_holidays_during_long_leave),
    pay_weekly_off_days_during_long_leave: input.pay_weekly_off_days_during_long_leave === undefined ? current.pay_weekly_off_days_during_long_leave : Number(input.pay_weekly_off_days_during_long_leave),
    allow_hr_override: input.allow_hr_override === undefined ? current.allow_hr_override : Number(input.allow_hr_override),
    default_salary_treatment: input.default_salary_treatment ?? current.default_salary_treatment ?? "unpaid",
    default_deduction_method: input.default_deduction_method ?? current.default_deduction_method ?? "calendar_days",
    require_payroll_review: input.require_payroll_review === undefined ? current.require_payroll_review ?? 1 : Number(input.require_payroll_review),
    require_return_to_work_confirmation: input.require_return_to_work_confirmation === undefined ? current.require_return_to_work_confirmation ?? 1 : Number(input.require_return_to_work_confirmation),
    approval_required: input.approval_required === undefined ? current.approval_required ?? 1 : Number(input.approval_required),
    partial_pay_ratio: input.partial_pay_ratio ?? current.partial_pay_ratio ?? 0.5,
  };
  if (!next.applies_to_foreigners && !next.applies_to_locals) {
    throw new AppError("Long leave must apply to at least one employee group.", "LONG_LEAVE_POLICY_NOT_FOUND", 400);
  }
  const existing = await repository.getLongLeaveSettings(env, context.companyId);
  if (existing) {
    await repository.upsertLongLeaveSettings(env, context.companyId, next);
  } else {
    await repository.insertLongLeaveSettings(env, context.companyId, next);
  }
  await ensureAudit(env, context, {
    action: LONG_LEAVE_AUDIT_ACTIONS.settingsChanged,
    entityType: "long_leave_settings",
    entityId: context.companyId,
    oldValue: current,
    newValue: next,
    reason: input.reason,
  });
  return { settings: await getSettings(env, context.companyId) };
};

export const getLongLeaveCoverageForDate = async (env: Env, context: AuthActor, employeeId: string, date: string) => {
  await ensureEmployeeAccess(env, context, employeeId);
  return {
    long_leave: await repository.findLongLeaveCoverageForDate(env, context.companyId, employeeId, date),
  };
};

export const getTimeline = async (env: Env, context: AuthActor, id: string) => {
  const record = await getRecord(env, context, id);
  const [salaryImpacts, payrollImpacts, auditEvents] = await Promise.all([
    repository.listImpacts(env, context.companyId, id),
    repository.listPayrollImpacts(env, context.companyId, id),
    repository.listAuditTimeline(env, context.companyId, id).catch(() => []),
  ]);
  const attendancePunches = await repository.countAttendanceDuringLongLeave(
    env,
    context.companyId,
    record.employee_id,
    record.start_date,
    record.actual_return_date ?? record.expected_return_date,
  ).catch(() => 0);
  return {
    long_leave: record,
    salary_impacts: salaryImpacts,
    payroll_impacts: payrollImpacts,
    attendance_warnings: attendancePunches > 0 ? [{
      type: "employee_worked_during_long_leave",
      severity: "warning",
      message: "Attendance was recorded during approved long leave and should be reviewed.",
      count: attendancePunches,
    }] : [],
    timeline: [
      { type: "long_leave_created", at: record.created_at, by: record.created_by, note: record.reason },
      ...auditEvents.map((event) => ({ type: event.action, at: event.created_at, by: event.actor_id, note: event.reason })),
      ...payrollImpacts.map((impact) => ({
        type: `payroll_impact_${impact.status}`,
        at: impact.applied_at ?? impact.calculated_at,
        payroll_month: impact.payroll_month,
        deduction_amount: impact.deduction_amount,
        payable_salary: impact.payable_salary,
      })),
    ],
  };
};
