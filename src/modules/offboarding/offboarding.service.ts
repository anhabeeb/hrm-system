import * as permissionService from "../../services/permission.service";
import { createAuditLog } from "../../services/audit.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, OutletAccessError, PermissionError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import { ACTIVE_OFFBOARDING_STATUSES, LEAVING_EMPLOYEE_STATUSES } from "./offboarding.constants";
import * as repository from "./offboarding.repository";
import type {
  FinalSettlementDraftRecord,
  OffboardingActionInput,
  OffboardingCaseRecord,
  OffboardingEmployeeRecord,
  OffboardingListFilters,
  OffboardingStartInput,
  OffboardingTaskRecord,
  OffboardingTaskSeed,
  OffboardingUpdateInput,
} from "./offboarding.types";

const DAY_MS = 86_400_000;

const dateOnly = (value: string) => value.slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const toDate = (value: string) => new Date(`${dateOnly(value)}T00:00:00Z`);
const addDays = (value: string, days: number) => {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const firstDayOfMonth = (value: string) => `${value.slice(0, 7)}-01`;
const nextMonthStart = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return date.toISOString().slice(0, 10);
};
const inclusiveDays = (start: string, end: string) =>
  Math.max(0, Math.floor((toDate(end).getTime() - toDate(start).getTime()) / DAY_MS) + 1);

const pagination = (filters: OffboardingListFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.max(1, Math.ceil(total / filters.page_size)),
});

const hasOffboardingPermission = (context: AuthActor, permission: string) =>
  permissionService.hasPermission(context, permission) ||
  permissionService.hasPermission(context, permission.replace("employees.offboarding", "offboarding")) ||
  permissionService.hasPermission(context, "employees.manage") ||
  permissionService.hasPermission(context, "employees.edit");

const assertViewPermission = (context: AuthActor) => {
  if (
    permissionService.hasPermission(context, "employees.view") ||
    hasOffboardingPermission(context, "employees.offboarding.view")
  ) {
    return;
  }
  throw new PermissionError();
};

const assertManagePermission = (context: AuthActor, permission = "employees.offboarding.manage") => {
  if (hasOffboardingPermission(context, permission)) return;
  throw new PermissionError();
};

const assertEmployeeAccess = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
): Promise<OffboardingEmployeeRecord> => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee || employee.deleted_at) {
    throw new NotFoundError("The requested employee could not be found.");
  }
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }
  return employee;
};

const assertCaseAccess = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  caseId: string,
) => {
  await assertEmployeeAccess(env, context, employeeId);
  const offboardingCase = await repository.findCaseById(env, context.companyId, employeeId, caseId);
  if (!offboardingCase) {
    throw new NotFoundError("The requested offboarding case could not be found.");
  }
  return offboardingCase;
};

const assertExitDateUnlocked = async (env: Env, companyId: string, exitDate: string, entity = "offboarding") => {
  const locked = await repository.findFinalizedPayrollRunByMonth(env, companyId, exitDate.slice(0, 7));
  if (!locked) return;
  throw new AppError({
    code: "RECORD_LOCKED",
    title: "Finalized payroll period",
    message: entity === "settlement"
      ? "Final settlement preparation cannot mutate a finalized payroll period."
      : "This offboarding exit date affects a finalized payroll period.",
    statusCode: 423,
    retryable: false,
    fieldErrors: { effective_exit_date: "Choose an exit date outside finalized payroll periods." },
  });
};

const audit = async (
  env: Env,
  context: AuthActor,
  input: {
    action: string;
    caseId?: string;
    taskId?: string;
    employeeId: string;
    reason?: string | null;
    details?: Record<string, unknown>;
  },
) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "offboarding",
    action: input.action,
    severity: input.action.includes("WAIVED") || input.action.includes("CANCELLED") ? "warning" : "info",
    entityType: input.taskId ? "employee_offboarding_task" : "employee_offboarding_case",
    entityId: input.taskId ?? input.caseId,
    employeeId: input.employeeId,
    actorId: context.actorUserId,
    reason: input.reason ?? undefined,
    details: input.details,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Offboarding audit log could not be recorded", {
      action: input.action,
      caseId: input.caseId,
      taskId: input.taskId,
      requestId: context.requestId,
      error,
    });
  });
};

const buildDefaultTasks = async (
  env: Env,
  companyId: string,
  employee: OffboardingEmployeeRecord,
  exitDate: string,
): Promise<OffboardingTaskSeed[]> => {
  const [
    linkedUsers,
    assets,
    uniforms,
    advances,
    loans,
    pendingLeave,
    leaveBalances,
    documents,
  ] = await Promise.all([
    repository.listLinkedUsers(env, companyId, employee.id),
    repository.listPendingAssetAssignments(env, companyId, employee.id),
    repository.listPendingUniformIssues(env, companyId, employee.id),
    repository.listOutstandingAdvances(env, companyId, employee.id),
    repository.listOutstandingLoans(env, companyId, employee.id),
    repository.listPendingLeaveAfterExit(env, companyId, employee.id, exitDate),
    repository.listLeaveBalances(env, companyId, employee.id, Number(exitDate.slice(0, 4))),
    repository.listEmployeeDocuments(env, companyId, employee.id),
  ]);

  const tasks: OffboardingTaskSeed[] = [];
  if (linkedUsers.length > 0) {
    tasks.push({
      taskType: "revoke_user_access",
      title: "Disable linked user access",
      description: "Disable employee login and revoke active sessions after clearance approval.",
      required: true,
      dueDate: exitDate,
      sourceType: "user",
      sourceId: "linked_users",
    });
  }
  for (const asset of assets) {
    tasks.push({
      taskType: "return_asset",
      title: `Return asset ${asset.asset_code ?? asset.asset_name ?? asset.id}`,
      description: asset.asset_name ?? "Assigned asset must be returned or settled.",
      required: true,
      dueDate: exitDate,
      sourceType: "asset_assignment",
      sourceId: asset.id,
    });
  }
  for (const uniform of uniforms) {
    tasks.push({
      taskType: "return_uniform",
      title: `Return uniform ${uniform.uniform_type}`,
      description: `${uniform.quantity ?? 1} item(s) issued on ${uniform.issued_date}.`,
      required: true,
      dueDate: exitDate,
      sourceType: "uniform_issue",
      sourceId: uniform.id,
    });
  }
  tasks.push({
    taskType: "complete_attendance",
    title: "Complete attendance review",
    description: "Confirm attendance is complete up to the exit date before final settlement.",
    required: true,
    dueDate: exitDate,
    sourceType: "attendance",
    sourceId: exitDate,
  });
  if (pendingLeave.length > 0) {
    tasks.push({
      taskType: "close_leave",
      title: "Close leave requests after exit date",
      description: `${pendingLeave.length} pending/approved leave request(s) continue after exit date.`,
      required: true,
      dueDate: exitDate,
      sourceType: "leave_requests",
      sourceId: "after_exit",
    });
  }
  if (leaveBalances.length > 0) {
    tasks.push({
      taskType: "close_leave",
      title: "Review leave balance",
      description: "Review leave balance for encashment or deduction policy before payroll finalization.",
      required: false,
      dueDate: exitDate,
      sourceType: "leave_balances",
      sourceId: String(exitDate.slice(0, 4)),
    });
  }
  if (advances.length > 0) {
    tasks.push({
      taskType: "clear_salary_advance",
      title: "Review outstanding salary advances",
      description: `${advances.length} salary advance record(s) remain outstanding. Do not mark paid until payroll finalization.`,
      required: true,
      dueDate: exitDate,
      sourceType: "advance_payments",
      sourceId: "outstanding",
    });
  }
  if (loans.length > 0) {
    tasks.push({
      taskType: "clear_salary_loan",
      title: "Review outstanding salary loans",
      description: `${loans.length} salary loan record(s) remain outstanding. Do not mark paid until payroll finalization.`,
      required: true,
      dueDate: exitDate,
      sourceType: "salary_loans",
      sourceId: "outstanding",
    });
  }
  if (employee.employee_type === "foreign" || documents.length > 0) {
    tasks.push({
      taskType: "collect_documents",
      title: employee.employee_type === "foreign" ? "Collect visa/work permit handover documents" : "Review employee documents",
      description: "Track document handover or cancellation evidence where applicable.",
      required: employee.employee_type === "foreign",
      dueDate: exitDate,
      sourceType: "employee_documents",
      sourceId: "handover",
    });
  }
  tasks.push({
    taskType: "final_payroll_review",
    title: "Prepare final settlement draft",
    description: "Prepare final settlement inputs for payroll review. This does not finalize payment.",
    required: true,
    dueDate: exitDate,
    sourceType: "final_settlement",
    sourceId: "draft",
  });
  tasks.push({
    taskType: "exit_interview",
    title: "Exit interview",
    description: "Optional HR exit interview and handover notes.",
    required: false,
    dueDate: exitDate,
    sourceType: "hr",
    sourceId: "exit_interview",
  });
  return tasks;
};

const generateDefaultTasks = async (
  env: Env,
  companyId: string,
  caseId: string,
  employee: OffboardingEmployeeRecord,
  exitDate: string,
) => {
  const tasks = await buildDefaultTasks(env, companyId, employee, exitDate);
  for (const task of tasks) {
    await repository.upsertTask(env, {
      id: createPrefixedId("off_task"),
      companyId,
      caseId,
      employeeId: employee.id,
      task,
    });
  }
  return tasks.length;
};

const detail = async (env: Env, context: AuthActor, employeeId: string, caseId: string) => {
  const offboardingCase = await assertCaseAccess(env, context, employeeId, caseId);
  const [tasks, settlement_draft] = await Promise.all([
    repository.listTasks(env, context.companyId, caseId),
    repository.getSettlementDraft(env, context.companyId, caseId),
  ]);
  return { case: offboardingCase, tasks, settlement_draft };
};

export const listCases = async (
  env: Env,
  context: AuthActor,
  filters: OffboardingListFilters,
) => {
  assertViewPermission(context);
  if (filters.outlet_id && !permissionService.hasOutletAccess(context, filters.outlet_id)) {
    throw new OutletAccessError("You do not have access to this outlet.");
  }
  const [rows, total] = await Promise.all([
    repository.listCases(env, context.companyId, filters, context.outletIds, context.isSuperAdmin),
    repository.countCases(env, context.companyId, filters, context.outletIds, context.isSuperAdmin),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const listEmployeeOffboarding = async (env: Env, context: AuthActor, employeeId: string) => {
  assertViewPermission(context);
  await assertEmployeeAccess(env, context, employeeId);
  const cases = await repository.listCasesForEmployee(env, context.companyId, employeeId);
  const activeCase = cases.find((row) => (ACTIVE_OFFBOARDING_STATUSES as readonly string[]).includes(row.status)) ?? null;
  const activeDetail = activeCase ? await detail(env, context, employeeId, activeCase.id) : null;
  return { cases, active_case: activeDetail };
};

export const getCase = async (env: Env, context: AuthActor, employeeId: string, caseId: string) => {
  assertViewPermission(context);
  return detail(env, context, employeeId, caseId);
};

export const startCase = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: OffboardingStartInput,
) => {
  assertManagePermission(context);
  const employee = await assertEmployeeAccess(env, context, employeeId);
  await assertExitDateUnlocked(env, context.companyId, input.effective_exit_date);
  const existingActive = await repository.findActiveCaseForEmployee(env, context.companyId, employeeId);
  if (existingActive) {
    throw new AppError({
      code: "OFFBOARDING_CASE_ALREADY_ACTIVE",
      title: "Offboarding already active",
      message: "This employee already has an active offboarding case.",
      statusCode: 409,
      retryable: false,
    });
  }

  if (!(LEAVING_EMPLOYEE_STATUSES as readonly string[]).includes(employee.employment_status)) {
    console.info("Offboarding started for a non-leaving status; status workflow remains separate", {
      employeeId,
      status: employee.employment_status,
      requestId: context.requestId,
    });
  }

  const caseId = createPrefixedId("off_case");
  await repository.createCase(env, {
    id: caseId,
    companyId: context.companyId,
    employeeId,
    offboardingType: input.offboarding_type,
    effectiveExitDate: input.effective_exit_date,
    reason: input.reason,
    notes: input.notes,
    initiatedBy: context.actorUserId,
  });
  const taskCount = input.create_default_tasks
    ? await generateDefaultTasks(env, context.companyId, caseId, employee, input.effective_exit_date)
    : 0;
  await audit(env, context, {
    action: "OFFBOARDING_STARTED",
    caseId,
    employeeId,
    reason: input.reason,
    details: { offboarding_type: input.offboarding_type, effective_exit_date: input.effective_exit_date, default_tasks_created: taskCount },
  });
  return detail(env, context, employeeId, caseId);
};

export const updateCase = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  caseId: string,
  input: OffboardingUpdateInput,
) => {
  assertManagePermission(context);
  const offboardingCase = await assertCaseAccess(env, context, employeeId, caseId);
  if (["completed", "cancelled"].includes(offboardingCase.status)) {
    throw new AppError({
      code: "OFFBOARDING_CASE_CLOSED",
      message: "This offboarding case is already closed.",
      statusCode: 409,
    });
  }
  await repository.updateCase(env, context.companyId, caseId, input);
  await audit(env, context, {
    action: "OFFBOARDING_UPDATED",
    caseId,
    employeeId,
    details: { ...input },
  });
  return detail(env, context, employeeId, caseId);
};

const lastSuperAdminProtectedError = () => new AppError({
  code: "LAST_SUPER_ADMIN_PROTECTED",
  title: "Super Admin protection",
  message: "This action would disable the last active Super Admin.",
  statusCode: 409,
  retryable: false,
});

const validateRevokeUserAccessTask = async (env: Env, context: AuthActor, employeeId: string) => {
  const linkedUsers = await repository.listLinkedUsers(env, context.companyId, employeeId);
  const affectedUsers = linkedUsers.filter((user) => user.status !== "disabled");
  for (const user of affectedUsers) {
    if (user.company_id !== context.companyId || user.employee_id !== employeeId) {
      throw new AppError({
        code: "USER_ACCESS_SCOPE_MISMATCH",
        title: "User access scope mismatch",
        message: "This linked user account cannot be modified by this offboarding task.",
        statusCode: 409,
        retryable: false,
      });
    }
  }
  if (affectedUsers.length === 0) {
    return affectedUsers;
  }

  const affectedUserIds = affectedUsers.map((user) => user.id);
  const [totalActiveSuperAdmins, affectedSuperAdminIds] = await Promise.all([
    repository.countActiveSuperAdmins(env, context.companyId),
    repository.listActiveSuperAdminIdsForUsers(env, context.companyId, affectedUserIds),
  ]);
  if (affectedSuperAdminIds.length > 0 && totalActiveSuperAdmins - affectedSuperAdminIds.length <= 0) {
    throw lastSuperAdminProtectedError();
  }

  return affectedUsers;
};

const auditRevokeUserAccessTask = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  caseId: string,
  taskId: string,
  users: Awaited<ReturnType<typeof validateRevokeUserAccessTask>>,
  reason?: string | null,
) => {
  for (const user of users) {
    await audit(env, context, {
      action: "OFFBOARDING_USER_ACCESS_DISABLED",
      caseId,
      taskId,
      employeeId,
      reason,
      details: { user_id: user.id },
    });
    await audit(env, context, {
      action: "OFFBOARDING_USER_SESSIONS_REVOKED",
      caseId,
      taskId,
      employeeId,
      reason,
      details: { user_id: user.id },
    });
  }
};

export const completeTask = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  caseId: string,
  taskId: string,
  input: OffboardingActionInput,
) => {
  assertManagePermission(context, "employees.offboarding.complete_task");
  const offboardingCase = await assertCaseAccess(env, context, employeeId, caseId);
  const task = await repository.findTaskById(env, context.companyId, caseId, taskId);
  if (!task) throw new NotFoundError("The requested offboarding task could not be found.");
  if (task.status === "completed") return detail(env, context, employeeId, caseId);
  if (["completed", "cancelled"].includes(offboardingCase.status)) {
    throw new AppError({ code: "OFFBOARDING_CASE_CLOSED", message: "This offboarding case is already closed.", statusCode: 409 });
  }

  if (task.task_type === "revoke_user_access") {
    const affectedUsers = await validateRevokeUserAccessTask(env, context, employeeId);
    await repository.completeRevokeUserAccessTask(
      env,
      context.companyId,
      taskId,
      context.actorUserId,
      affectedUsers.map((user) => user.id),
      input.notes ?? input.reason ?? (affectedUsers.length === 0 ? "No linked users found or all linked users are already disabled." : null),
    );
    await auditRevokeUserAccessTask(env, context, employeeId, caseId, taskId, affectedUsers, input.reason);
  } else {
    await repository.completeTask(env, context.companyId, taskId, context.actorUserId, input.notes ?? input.reason ?? null);
  }
  await audit(env, context, {
    action: "OFFBOARDING_TASK_COMPLETED",
    caseId,
    taskId,
    employeeId,
    reason: input.reason,
    details: { task_type: task.task_type, source_type: task.source_type, source_id: task.source_id },
  });
  return detail(env, context, employeeId, caseId);
};

export const waiveTask = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  caseId: string,
  taskId: string,
  input: OffboardingActionInput,
) => {
  assertManagePermission(context, "employees.offboarding.complete_task");
  await assertCaseAccess(env, context, employeeId, caseId);
  const task = await repository.findTaskById(env, context.companyId, caseId, taskId);
  if (!task) throw new NotFoundError("The requested offboarding task could not be found.");
  await repository.waiveTask(env, context.companyId, taskId, context.actorUserId, input.reason ?? "Waived");
  await audit(env, context, {
    action: "OFFBOARDING_TASK_WAIVED",
    caseId,
    taskId,
    employeeId,
    reason: input.reason,
    details: { task_type: task.task_type, source_type: task.source_type, source_id: task.source_id },
  });
  return detail(env, context, employeeId, caseId);
};

export const cancelCase = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  caseId: string,
  input: OffboardingActionInput,
) => {
  assertManagePermission(context);
  await assertCaseAccess(env, context, employeeId, caseId);
  await repository.cancelCase(env, context.companyId, caseId, context.actorUserId, input.reason ?? "Cancelled");
  await audit(env, context, { action: "OFFBOARDING_CANCELLED", caseId, employeeId, reason: input.reason });
  return detail(env, context, employeeId, caseId);
};

export const markReady = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  caseId: string,
  input: OffboardingActionInput,
) => {
  assertManagePermission(context);
  const tasks = await repository.listTasks(env, context.companyId, caseId);
  const openRequiredTasks = tasks.filter((task) => task.required === 1 && !["completed", "waived"].includes(task.status));
  if (openRequiredTasks.length > 0) {
    throw new AppError({
      code: "OFFBOARDING_TASKS_PENDING",
      title: "Offboarding tasks pending",
      message: "Required offboarding tasks must be completed or waived before final settlement.",
      statusCode: 409,
      retryable: false,
      details: { pending_required_tasks: openRequiredTasks.length },
    });
  }
  await assertCaseAccess(env, context, employeeId, caseId);
  await repository.markReady(env, context.companyId, caseId);
  await audit(env, context, { action: "OFFBOARDING_READY_FOR_FINAL_SETTLEMENT", caseId, employeeId, reason: input.reason });
  return detail(env, context, employeeId, caseId);
};

export const completeCase = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  caseId: string,
  input: OffboardingActionInput,
) => {
  assertManagePermission(context);
  const offboardingCase = await assertCaseAccess(env, context, employeeId, caseId);
  if (offboardingCase.final_settlement_status !== "prepared") {
    throw new AppError({
      code: "FINAL_SETTLEMENT_NOT_PREPARED",
      title: "Final settlement not prepared",
      message: "Final settlement must be prepared before completing offboarding.",
      statusCode: 409,
      retryable: false,
    });
  }
  await repository.completeCase(env, context.companyId, caseId, context.actorUserId);
  await audit(env, context, { action: "OFFBOARDING_COMPLETED", caseId, employeeId, reason: input.reason });
  return detail(env, context, employeeId, caseId);
};

const calculateSettlementDraft = async (
  env: Env,
  context: AuthActor,
  employee: OffboardingEmployeeRecord,
  offboardingCase: OffboardingCaseRecord,
): Promise<FinalSettlementDraftRecord> => {
  await assertExitDateUnlocked(env, context.companyId, offboardingCase.effective_exit_date, "settlement");
  const exitDate = offboardingCase.effective_exit_date;
  const exitMonth = exitDate.slice(0, 7);
  const latestFinalized = await repository.findLatestFinalizedPayrollMonth(env, context.companyId, employee.id, exitMonth);
  const periodStart = latestFinalized ? nextMonthStart(latestFinalized.payroll_month) : firstDayOfMonth(exitDate);
  const periodEnd = exitDate;
  const days = inclusiveDays(periodStart, periodEnd);
  const salary = await repository.findLatestSalary(env, context.companyId, employee.id, exitDate);
  const monthlySalary = Number(salary?.monthly_salary_amount ?? 0);
  const currency = String(salary?.currency ?? "MVR");
  const dailySalary = Math.trunc(monthlySalary / 30);
  const basicSalaryDue = dailySalary * days;
  const components = await repository.listActiveCompensationComponents(env, context.companyId, employee.id, exitDate);
  const allowancesDue = components
    .filter((component) => ["allowance", "cash_benefit", "benefit"].includes(String(component.component_type)) && Number(component.affects_net_pay ?? 1) === 1)
    .reduce((total, component) => total + Math.trunc((Number(component.amount ?? 0) / 30) * days), 0);
  const [unpaidLeaveDays, absentDays, advances, loans, assetDeductions] = await Promise.all([
    repository.sumUnpaidLeaveDays(env, context.companyId, employee.id, periodStart, periodEnd),
    repository.countAbsentDays(env, context.companyId, employee.id, periodStart, periodEnd),
    repository.listOutstandingAdvances(env, context.companyId, employee.id),
    repository.listOutstandingLoans(env, context.companyId, employee.id),
    repository.sumOpenAssetDeductions(env, context.companyId, employee.id),
  ]);
  const unpaidLeaveDeductions = dailySalary * Number(unpaidLeaveDays);
  const attendanceDeductions = dailySalary * Number(absentDays);
  const advancesOutstanding = advances.reduce((total, advance) => total + Math.max(0, Number(advance.amount ?? 0) - Number(advance.repaid_amount ?? 0)), 0);
  const loansOutstanding = loans.reduce((total, loan) => total + Math.max(0, Number(loan.outstanding_amount ?? 0)), 0);
  const estimatedNetSettlement =
    basicSalaryDue +
    allowancesDue -
    unpaidLeaveDeductions -
    attendanceDeductions -
    advancesOutstanding -
    loansOutstanding -
    assetDeductions;

  const now = new Date().toISOString();
  return {
    id: createPrefixedId("settle"),
    company_id: context.companyId,
    employee_id: employee.id,
    offboarding_case_id: offboardingCase.id,
    status: "draft",
    period_start: periodStart,
    period_end: periodEnd,
    basic_salary_due: basicSalaryDue,
    allowances_due: allowancesDue,
    unpaid_leave_deductions: unpaidLeaveDeductions,
    attendance_deductions: attendanceDeductions,
    advances_outstanding: advancesOutstanding,
    loans_outstanding: loansOutstanding,
    asset_deductions: assetDeductions,
    uniform_deductions: 0,
    leave_encashment: 0,
    gratuity_or_service_benefit: 0,
    other_earnings: 0,
    other_deductions: 0,
    estimated_net_settlement: estimatedNetSettlement,
    currency,
    calculation_metadata_json: JSON.stringify({
      salary_record_id: salary?.id ?? null,
      salary_basis: "fixed_30_days_preview",
      daily_salary: dailySalary,
      payable_days: days,
      source: "offboarding_preparation_only",
      advances_count: advances.length,
      loans_count: loans.length,
      components: components.map((component) => ({ id: component.id, type: component.component_type, amount: component.amount })),
      note: "Draft only. Advances, loans, payroll, and payslips are not finalized by offboarding preparation.",
    }),
    created_by: context.actorUserId,
    created_at: now,
    updated_at: now,
  };
};

export const prepareFinalSettlement = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  caseId: string,
  input: OffboardingActionInput,
) => {
  assertManagePermission(context, "employees.offboarding.final_settlement");
  const employee = await assertEmployeeAccess(env, context, employeeId);
  const offboardingCase = await assertCaseAccess(env, context, employeeId, caseId);
  if (offboardingCase.status === "cancelled") {
    throw new AppError({ code: "OFFBOARDING_CASE_CLOSED", message: "This offboarding case is cancelled.", statusCode: 409 });
  }
  const draft = await calculateSettlementDraft(env, context, employee, offboardingCase);
  await repository.upsertSettlementDraft(env, draft);
  await repository.updateCaseSettlementStatus(env, context.companyId, caseId, "prepared");
  await audit(env, context, {
    action: "FINAL_SETTLEMENT_DRAFT_PREPARED",
    caseId,
    employeeId,
    reason: input.reason,
    details: {
      period_start: draft.period_start,
      period_end: draft.period_end,
      estimated_net_settlement: draft.estimated_net_settlement,
      currency: draft.currency,
    },
  });
  return detail(env, context, employeeId, caseId);
};
