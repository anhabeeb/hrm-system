import type {
  DocumentMetadataInput,
  EmployeeCreateInput,
  EmployeeLoginCreateInput,
  EmployeeListFilters,
  EmployeeListRow,
  EmployeePersistInput,
  EmployeeNoteInput,
  EmployeeRecord,
  EmployeeStatusInput,
  PayrollEligibilityResult,
  EmployeeUpdateInput,
  EmployeeWriteInput,
  CompensationComponentDefinitionFilters,
  CompensationComponentDefinitionInput,
  CompensationApprovalApplicationAction,
  CompensationApprovalApplicationRecord,
  CompensationEffectiveStatus,
  EmployeeCompensationComponentChangeInput,
  EmployeeCompensationComponentInput,
  EmployeeCompensationComponentRecord,
  EmployeeCompensationComponentEndInput,
  JobChangeInput,
  OutletAssignmentInput,
  SalaryHistoryInput,
} from "./employees.types";
import * as employeesRepository from "./employees.repository";
import * as usersRepository from "../users/users.repository";
import {
  EMPLOYEE_EXIT_STATUSES,
  EMPLOYEE_PAYROLL_ELIGIBLE_STATUSES,
  EMPLOYEE_STATUS_ACCESS_DEFAULTS,
  EMPLOYMENT_STATUSES,
} from "./employees.constants";
import { createAuditLog } from "../../services/audit.service";
import { hashPassword } from "../../services/password.service";
import { PASSWORD_HASH_ALGORITHM } from "../auth/auth.constants";
import { broadcastEvent } from "../../services/realtime.service";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import { createApprovalRequestForWorkflow } from "../approvals/approvals.service";
import { createSyncChange } from "../sync/sync-change.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import {
  AppError,
  NotFoundError,
  OutletAccessError,
  PermissionError,
  ValidationError,
} from "../../utils/errors";
import { createEntityId, createPrefixedId } from "../../utils/ids";

type EmployeeInternalUpdateInput = EmployeeUpdateInput & {
  primary_outlet_id?: string;
  employment_status?: EmployeeWriteInput["employment_status"];
};

type SalaryApprovalPayload = {
  approval_action: "salary_change";
  approval_type: string;
  employee_id: string;
  current_salary_record_id: string | null;
  old_monthly_salary_amount: number | null;
  old_currency: string | null;
  old_effective_from: string | null;
  proposed_salary: SalaryHistoryInput;
  requested_by: string;
};

type JobSalaryApprovalPayload = {
  approval_action: "job_change_with_salary";
  approval_type: "promotion_with_salary_change";
  employee_id: string;
  expected_job: {
    outlet_id: string | null;
    department_id: string | null;
    position_id: string | null;
  };
  current_salary_record_id: string | null;
  old_monthly_salary_amount: number | null;
  old_currency: string | null;
  job_change: JobChangeInput;
  requested_by: string;
};

type CompensationApprovalPayload = {
  approval_action: "compensation_component_create" | "compensation_component_change" | "compensation_component_end";
  employee_id: string;
  component_id?: string | null;
  current_component?: EmployeeCompensationComponentRecord | null;
  expected_current_component?: {
    id: string;
    status: string;
    effective_status: CompensationEffectiveStatus;
    effective_from: string;
    effective_to: string | null;
    amount: number;
    currency: string;
    calculation_type: string;
    affects_gross_pay: number;
    affects_net_pay: number;
    revision: number;
    updated_at: string;
  } | null;
  proposed_component?: EmployeeCompensationComponentInput | null;
  end_component?: EmployeeCompensationComponentEndInput | null;
  requested_by: string;
};

const nowIso = () => new Date().toISOString();
const todayIso = () => nowIso().slice(0, 10);
const DAY_MS = 86_400_000;

const toDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const dateOnly = (value: string) => value.slice(0, 10);

const countInclusiveDays = (startDate: string, endDate: string) =>
  Math.floor((toDate(endDate).getTime() - toDate(startDate).getTime()) / DAY_MS) + 1;

const maxDate = (a: string, b: string) => (a > b ? a : b);
const minDate = (a: string, b: string) => (a < b ? a : b);

const hasSensitivePermission = (context: AuthActor) =>
  permissionService.hasPermission(context, "employees.view_sensitive");

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
    reason?: string;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: "employees",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId,
    actorId: context.actorUserId,
    oldValueJson:
      input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson:
      input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  if (!result.created) {
    throw new AppError(
      "Audit log could not be recorded. Please try again.",
      "SERVER_ERROR",
      500,
    );
  }
};

const auditUserLoginDisabled = async (
  env: Env,
  context: AuthActor,
  input: {
    userId: string;
    employeeId: string;
    reason: string;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    module: "employees",
    action: "linked_user_disabled",
    entityType: "user",
    entityId: input.userId,
    employeeId: input.employeeId,
    actorId: context.actorUserId,
    reason: input.reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  if (!result.created) {
    throw new AppError(
      "Audit log could not be recorded. Please try again.",
      "SERVER_ERROR",
      500,
    );
  }
};

const disableLinkedUserLogins = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  reason: string,
  options: { disableUserAccess?: boolean; revokeActiveSessions?: boolean } = {
    disableUserAccess: true,
    revokeActiveSessions: true,
  },
) => {
  const linkedUsers = await employeesRepository.findLinkedUsersByEmployeeId(
    env,
    context.companyId,
    employeeId,
  );

  for (const user of linkedUsers) {
    if (options.disableUserAccess) {
      const remainingSuperAdmins = await employeesRepository.countActiveSuperAdminsExcludingUser(
        env,
        context.companyId,
        user.id,
      );
      if (remainingSuperAdmins === 0) {
        throw new AppError({
          code: "EMPLOYEE_STATUS_PERMISSION_DENIED",
          title: "Employee status permission denied",
          message: "This status change would disable the last active Super Admin.",
          statusCode: 409,
          retryable: false,
        });
      }
    }

    if (options.disableUserAccess && user.status !== "disabled") {
      await employeesRepository.disableLinkedUser(env, context.companyId, user.id);
      await auditUserLoginDisabled(env, context, {
        userId: user.id,
        employeeId,
        reason,
      });
    }

    if (options.revokeActiveSessions) {
      await employeesRepository.revokeUserSessions(env, context.companyId, user.id);
      await ensureAudit(env, context, {
        action: "LINKED_USER_SESSIONS_REVOKED",
        entityType: "user",
        entityId: user.id,
        employeeId,
        reason,
      });
    }
  }
};

const broadcast = async (
  env: Env,
  context: AuthActor,
  type: string,
  payload: Record<string, unknown>,
) => {
  await broadcastEvent(env, {
    roomName: `company:${context.companyId}`,
    type,
    payload,
    triggeredBy: context.actorUserId,
  }).catch((error) => console.error("Employee realtime event failed", error));
};

const trackEmployeeSyncChange = async (
  env: Env,
  context: AuthActor,
  input: {
    employeeId: string;
    outletId?: string | null;
    actionType: string;
    payload?: Record<string, unknown>;
  },
) => {
  await createSyncChange(env, {
    companyId: context.companyId,
    outletId: input.outletId,
    entityType: "employee",
    entityId: input.employeeId,
    actionType: input.actionType,
    changedBy: context.actorUserId,
    payload: input.payload,
  });
};

const canManageJobChanges = (context: AuthActor) =>
  permissionService.hasAnyPermission(context, [
    "employees.edit",
    "employees.job_change.manage",
    "employees.manage",
  ]);

const canManageSalaryChanges = (context: AuthActor) =>
  permissionService.hasAnyPermission(context, [
    "payroll.manage",
    "employees.salary.manage",
    "employees.edit_salary",
    "salary.create",
    "salary.edit",
  ]);

const canViewCompensation = (context: AuthActor) =>
  permissionService.hasAnyPermission(context, [
    "employees.compensation.view",
    "employees.salary.view",
    "employees.view_salary",
    "payroll.view",
    "salary.view",
    "salary.history",
  ]);

const canManageCompensation = (context: AuthActor) =>
  permissionService.hasAnyPermission(context, [
    "employees.compensation.manage",
    "employees.salary.manage",
    "employees.edit_salary",
    "payroll.manage",
    "salary.create",
    "salary.edit",
  ]);

const canManageCompensationDefinitions = (context: AuthActor) =>
  permissionService.hasAnyPermission(context, [
    "payroll.settings.manage",
    "payroll_settings.manage",
    "settings.manage",
    "employees.compensation.manage",
    "payroll.manage",
  ]);

const maskValue = (value: string | null): string | null => {
  if (!value) {
    return value;
  }

  if (value.length <= 4) {
    return "****";
  }

  return `${"*".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
};

const maskEmployee = <T extends EmployeeListRow | EmployeeRecord>(
  employee: T,
  includeSensitive: boolean,
): T =>
  includeSensitive
    ? employee
    : {
        ...employee,
        id_card_number: maskValue(employee.id_card_number),
        passport_number: maskValue(employee.passport_number),
        work_permit_number: maskValue(employee.work_permit_number),
        bank_name: null,
      };

const normalizeOptionalText = (
  value: string | null | undefined,
  options: { uppercase?: boolean } = {},
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return options.uppercase ? trimmed.toUpperCase() : trimmed;
};

const normalizeEmployeeInput = <T extends EmployeeWriteInput | EmployeeUpdateInput>(
  input: T,
): T => ({
  ...input,
  nationality: normalizeOptionalText(input.nationality),
  id_card_number: normalizeOptionalText(input.id_card_number, { uppercase: true }),
  passport_number: normalizeOptionalText(input.passport_number, { uppercase: true }),
  work_permit_number: normalizeOptionalText(input.work_permit_number, { uppercase: true }),
  passport_expiry_date: normalizeOptionalText(input.passport_expiry_date),
  work_permit_expiry_date: normalizeOptionalText(input.work_permit_expiry_date),
  phone: normalizeOptionalText(input.phone),
  emergency_contact_name: normalizeOptionalText(input.emergency_contact_name),
  emergency_contact_phone: normalizeOptionalText(input.emergency_contact_phone),
  emergency_contact_relation: normalizeOptionalText(input.emergency_contact_relation),
  contract_type: normalizeOptionalText(input.contract_type),
  bank_name: normalizeOptionalText(input.bank_name),
  bank_account_masked: normalizeOptionalText(input.bank_account_masked),
  notes: normalizeOptionalText(input.notes),
});

const normalizeEmployeeForPersist = (input: EmployeePersistInput): EmployeePersistInput => {
  const normalized = normalizeEmployeeInput(input) as EmployeePersistInput;

  if (normalized.employee_type === "local" && !normalized.nationality) {
    normalized.nationality = "Maldives";
  }

  return normalized;
};

const ensureIdentityRequirements = (input: EmployeePersistInput) => {
  if (input.employee_type === "local" && !input.id_card_number) {
    throw new ValidationError("National ID number is required for local employees.", {
      id_card_number: "National ID number is required for local employees.",
    });
  }

  if (input.employee_type !== "foreign") {
    return;
  }

  const fieldErrors: Record<string, string> = {};
  if (!input.nationality) fieldErrors.nationality = "Nationality is required for foreign employees.";
  if (!input.passport_number) fieldErrors.passport_number = "Passport number is required for foreign employees.";
  if (!input.passport_expiry_date) fieldErrors.passport_expiry_date = "Passport expiry date is required for foreign employees.";
  if (!input.work_permit_number) fieldErrors.work_permit_number = "Work permit number is required for foreign employees.";
  if (!input.work_permit_expiry_date) fieldErrors.work_permit_expiry_date = "Work permit expiry date is required for foreign employees.";

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError("Please complete the required foreign employee identity fields.", fieldErrors);
  }
};

const duplicateIdentityError = (
  field: "employee_code" | "id_card_number" | "passport_number" | "work_permit_number",
) => {
  const details = {
    employee_code: {
      code: "DUPLICATE_EMPLOYEE_CODE",
      title: "Duplicate employee ID",
      message: "This employee ID is already used by another employee.",
      field: "employee_code",
    },
    id_card_number: {
      code: "DUPLICATE_NATIONAL_ID",
      title: "Duplicate National ID",
      message: "This National ID is already used by another employee.",
      field: "id_card_number",
    },
    passport_number: {
      code: "DUPLICATE_PASSPORT_NUMBER",
      title: "Duplicate passport number",
      message: "This passport number is already used by another employee.",
      field: "passport_number",
    },
    work_permit_number: {
      code: "DUPLICATE_WORK_PERMIT_NUMBER",
      title: "Duplicate work permit number",
      message: "This work permit number is already used by another employee.",
      field: "work_permit_number",
    },
  }[field];

  return new AppError({
    code: details.code,
    title: details.title,
    message: details.message,
    statusCode: 409,
    retryable: false,
    fieldErrors: { [details.field]: details.message },
  });
};

const ensureUniqueIdentity = async (
  env: Env,
  companyId: string,
  input: Pick<EmployeePersistInput, "employee_code" | "id_card_number" | "passport_number" | "work_permit_number">,
  currentEmployeeId?: string,
) => {
  const duplicateCode = await employeesRepository.findEmployeeByCode(
    env,
    companyId,
    input.employee_code,
  );

  if (duplicateCode && duplicateCode.id !== currentEmployeeId) {
    throw duplicateIdentityError("employee_code");
  }

  for (const field of ["id_card_number", "passport_number", "work_permit_number"] as const) {
    const value = input[field];

    if (!value) {
      continue;
    }

    const duplicate = await employeesRepository.findEmployeeByIdentityField(
      env,
      companyId,
      field,
      value,
    );

    if (duplicate && duplicate.id !== currentEmployeeId) {
      throw duplicateIdentityError(field);
    }
  }
};

const formatEmployeeCode = (prefix: string, number: number, padding: number) =>
  `${prefix}-${String(number).padStart(padding, "0")}`;

const ensureEmployeeCodeSequence = async (env: Env, companyId: string) => {
  let sequence = await employeesRepository.getEmployeeCodeSequence(env, companyId);

  if (sequence) {
    return sequence;
  }

  const nextNumber = await employeesRepository.getNextEmployeeCodeNumberFromExisting(env, companyId);
  await employeesRepository.createEmployeeCodeSequence(env, companyId, nextNumber);
  sequence = await employeesRepository.getEmployeeCodeSequence(env, companyId);

  return sequence ?? {
    company_id: companyId,
    prefix: "EMP",
    next_number: nextNumber,
    padding: 6,
  };
};

const generateEmployeeCode = async (env: Env, companyId: string): Promise<string> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const sequence = await ensureEmployeeCodeSequence(env, companyId);
    const code = formatEmployeeCode(sequence.prefix, sequence.next_number, sequence.padding);
    const existing = await employeesRepository.findEmployeeByCode(env, companyId, code);

    await employeesRepository.advanceEmployeeCodeSequence(env, companyId, sequence.next_number);

    if (!existing) {
      return code;
    }
  }

  throw new AppError(
    "Employee ID could not be generated. Please try again.",
    "EMPLOYEE_CODE_GENERATION_FAILED",
    500,
  );
};

const sanitizeEmployeeDocument = (
  document: Record<string, unknown>,
  includeSensitive: boolean,
) => {
  const {
    file_key: _fileKey,
    storage_path: _storagePath,
    bucket_path: _bucketPath,
    private_object_key: _privateObjectKey,
    company_id: _companyId,
    deleted_at: _deletedAt,
    ...safe
  } = document;

  if (safe.is_sensitive === 1 && !includeSensitive) {
    safe.file_name = "Sensitive document";
  }

  return safe;
};

const ensureEmployeeAccess = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
): Promise<EmployeeListRow> => {
  const employee = await employeesRepository.findEmployeeById(
    env,
    context.companyId,
    employeeId,
  );

  if (!employee) {
    throw new NotFoundError("The requested employee could not be found.");
  }

  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }

  return employee;
};

export const resolveActorLinkedEmployeeId = async (
  env: Env,
  context: AuthActor,
): Promise<string | null> => {
  const linked = await employeesRepository.findLinkedEmployeeIdForUser(
    env,
    context.companyId,
    context.actorUserId,
  );

  return linked?.employee_id ?? null;
};

const ensureEmployeeSelfServiceAccess = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
): Promise<EmployeeListRow> => {
  const linkedEmployeeId = await resolveActorLinkedEmployeeId(env, context);
  if (!linkedEmployeeId || linkedEmployeeId !== employeeId) {
    throw new PermissionError("You can only view alerts for your own employee profile.");
  }

  const employee = await employeesRepository.findEmployeeById(
    env,
    context.companyId,
    employeeId,
  );

  if (!employee) {
    throw new NotFoundError("The requested employee could not be found.");
  }

  return employee;
};

const ensureEmployeeProfileSectionAccess = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  options: {
    scopedPermissions: string[];
    ownPermissions: string[];
    ownDeniedMessage: string;
  },
): Promise<EmployeeListRow> => {
  if (permissionService.hasAnyPermission(context, options.scopedPermissions)) {
    return ensureEmployeeAccess(env, context, employeeId);
  }

  if (permissionService.hasAnyPermission(context, options.ownPermissions)) {
    return ensureEmployeeSelfServiceAccess(env, context, employeeId);
  }

  throw new PermissionError(options.ownDeniedMessage);
};

const ensureReferenceData = async (
  env: Env,
  context: AuthActor,
  input: Pick<EmployeeWriteInput, "primary_outlet_id" | "department_id" | "position_id">,
) => {
  const outlet = await employeesRepository.findActiveOutlet(
    env,
    context.companyId,
    input.primary_outlet_id,
  );

  if (!outlet || outlet.status !== "active") {
    throw new ValidationError("Please choose an active outlet.");
  }

  if (!permissionService.hasOutletAccess(context, input.primary_outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }

  if (input.department_id) {
    const department = await employeesRepository.findDepartment(
      env,
      context.companyId,
      input.department_id,
    );

    if (!department || department.status !== "active") {
      throw new ValidationError("Please choose an active department.");
    }
  }

  if (input.position_id) {
    const position = await employeesRepository.findPosition(
      env,
      context.companyId,
      input.position_id,
    );

    if (!position || position.status !== "active") {
      throw new ValidationError("Please choose an active position.");
    }
  }
};

const mergeEmployee = (
  existing: EmployeeListRow,
  input: EmployeeInternalUpdateInput,
): EmployeePersistInput & {
  resigned_at?: string | null;
  terminated_at?: string | null;
  deleted_at?: string | null;
} => ({
  employee_code: existing.employee_code,
  full_name: input.full_name ?? existing.full_name,
  employee_type: input.employee_type ?? existing.employee_type,
  primary_outlet_id: input.primary_outlet_id ?? existing.primary_outlet_id ?? "",
  department_id:
    input.department_id !== undefined ? input.department_id : existing.department_id,
  position_id:
    input.position_id !== undefined ? input.position_id : existing.position_id,
  employment_status: input.employment_status ?? existing.employment_status,
  joined_at: input.joined_at !== undefined ? input.joined_at : existing.joined_at,
  nationality: input.nationality !== undefined ? input.nationality : existing.nationality,
  id_card_number:
    input.id_card_number !== undefined ? input.id_card_number : existing.id_card_number,
  passport_number:
    input.passport_number !== undefined
      ? input.passport_number
      : existing.passport_number,
  passport_expiry_date:
    input.passport_expiry_date !== undefined
      ? input.passport_expiry_date
      : existing.passport_expiry_date,
  work_permit_number:
    input.work_permit_number !== undefined
      ? input.work_permit_number
      : existing.work_permit_number,
  work_permit_expiry_date:
    input.work_permit_expiry_date !== undefined
      ? input.work_permit_expiry_date
      : existing.work_permit_expiry_date,
  phone: input.phone !== undefined ? input.phone : existing.phone,
  emergency_contact_name:
    input.emergency_contact_name !== undefined
      ? input.emergency_contact_name
      : existing.emergency_contact_name,
  emergency_contact_phone:
    input.emergency_contact_phone !== undefined
      ? input.emergency_contact_phone
      : existing.emergency_contact_phone,
  emergency_contact_relation:
    input.emergency_contact_relation !== undefined
      ? input.emergency_contact_relation
      : existing.emergency_contact_relation,
  contract_type:
    input.contract_type !== undefined ? input.contract_type : existing.contract_type,
  bank_name: input.bank_name !== undefined ? input.bank_name : existing.bank_name,
  bank_account_masked:
    input.bank_account_masked !== undefined
      ? input.bank_account_masked
      : existing.bank_account_masked,
  notes: input.notes !== undefined ? input.notes : existing.notes,
  resigned_at: existing.resigned_at,
  terminated_at: existing.terminated_at,
  deleted_at: existing.deleted_at,
});

export const listEmployees = async (
  env: Env,
  context: AuthActor,
  filters: EmployeeListFilters,
) => {
  const outletScope = {
    isSuperAdmin: permissionService.isSuperAdmin(context),
    outletIds: context.outletIds,
  };
  const [total, rows] = await Promise.all([
    employeesRepository.countEmployees(
      env,
      context.companyId,
      filters,
      outletScope,
    ),
    employeesRepository.listEmployees(
      env,
      context.companyId,
      filters,
      outletScope,
    ),
  ]);
  const pagination: PaginationMeta = {
    page: filters.page,
    page_size: filters.page_size,
    total,
    total_pages: Math.ceil(total / filters.page_size),
  };

  return {
    rows: rows.map((row) => maskEmployee(row, false)),
    pagination,
  };
};

export const getEmployee = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => maskEmployee(await ensureEmployeeAccess(env, context, employeeId), hasSensitivePermission(context));

export const createEmployeeLogin = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: EmployeeLoginCreateInput,
) => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  if (employee.deleted_at || employee.employment_status === "archived") {
    throw new AppError({
      code: "EMPLOYEE_NOT_FOUND",
      message: "The selected employee could not be found.",
      statusCode: 404,
      retryable: false,
    });
  }

  const existingLogin = await usersRepository.findUserByEmployeeId(env, context.companyId, employeeId);
  if (existingLogin) {
    throw new AppError({
      code: "EMPLOYEE_ALREADY_HAS_LOGIN",
      title: "Login already assigned",
      message: "This employee already has a linked login account.",
      statusCode: 409,
      retryable: false,
    });
  }

  const existingUsername = await usersRepository.findUserByUsername(env, context.companyId, input.username);
  if (existingUsername) {
    throw new AppError({
      code: "DUPLICATE_USERNAME",
      message: "A user with this username already exists.",
      statusCode: 409,
      retryable: false,
    });
  }

  if (input.email) {
    const existingEmail = await usersRepository.findUserByEmail(env, context.companyId, input.email);
    if (existingEmail) {
      throw new AppError({
        code: "DUPLICATE_USER_EMAIL",
        message: "A user with this email already exists.",
        statusCode: 409,
        retryable: false,
      });
    }
  }

  const roles = await usersRepository.findRolesByIds(env, context.companyId, [input.role_id]);
  if (roles.length !== 1) {
    throw new AppError({
      code: "ROLE_NOT_FOUND",
      message: "Please choose a valid role.",
      statusCode: 404,
      retryable: false,
    });
  }

  const requestedOutletIds = [...new Set(input.store_ids ?? input.outlet_ids ?? [])];
  const defaultOutletIds = employee.primary_outlet_id ? [employee.primary_outlet_id] : [];
  const outletIds = requestedOutletIds.length > 0 ? requestedOutletIds : defaultOutletIds;
  if (outletIds.some((outletId) => !permissionService.hasOutletAccess(context, outletId))) {
    throw new OutletAccessError("You cannot assign login access outside your outlet scope.");
  }
  if (outletIds.length > 0) {
    const outlets = await usersRepository.findOutletsByIds(env, context.companyId, outletIds);
    if (outlets.length !== outletIds.length) {
      throw new AppError({
        code: "OUTLET_NOT_FOUND",
        message: "One or more selected outlets could not be found.",
        statusCode: 404,
        retryable: false,
      });
    }
  }

  const userId = createPrefixedId("user");
  const passwordHash = await hashPassword(input.temporary_password, env.PASSWORD_PEPPER, env);
  await usersRepository.createEmployeeLoginUser(env, {
    id: userId,
    companyId: context.companyId,
    employeeId,
    fullName: employee.full_name,
    username: input.username,
    email: input.email ?? null,
    passwordHash,
    passwordAlgo: PASSWORD_HASH_ALGORITHM,
    forcePasswordChange: input.force_password_change,
    require2fa: input.require_2fa,
    status: input.is_active ? "active" : "disabled",
    roleId: input.role_id,
    outletIds,
  });

  await ensureAudit(env, context, {
    action: "employee_login_created",
    entityType: "user",
    entityId: userId,
    employeeId,
    outletId: employee.primary_outlet_id,
    newValue: {
      user_id: userId,
      employee_id: employeeId,
      username: input.username,
      email: input.email ?? null,
      role_id: input.role_id,
      outlet_ids: outletIds,
      force_password_change: input.force_password_change,
      require_2fa: false,
      is_active: input.is_active,
    },
  });

  return {
    user_id: userId,
    employee_id: employeeId,
    username: input.username,
    email: input.email ?? null,
    role_id: input.role_id,
    is_active: input.is_active,
    force_password_change: input.force_password_change,
    require_2fa: false,
  };
};

const profileLimit = (limit?: number) => Math.min(Math.max(limit ?? 25, 1), 100);

const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const today = () => new Date().toISOString().slice(0, 10);

const requireProfilePermission = (context: AuthActor, permissions: string[], message: string) => {
  if (!permissionService.hasAnyPermission(context, permissions)) {
    throw new PermissionError(message);
  }
};

export const getEmployeeProfileSummary = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  const warnings = await employeesRepository.profileWarnings(env, context.companyId, employeeId);

  return {
    employee: maskEmployee(employee, hasSensitivePermission(context)),
    warnings: {
      expiring_documents: Number(warnings?.expiring_documents ?? 0),
      active_long_leave: Number(warnings?.active_long_leave ?? 0),
      missing_punches: Number(warnings?.missing_punches ?? 0),
      pending_approvals: Number(warnings?.pending_approvals ?? 0),
      payroll_warnings: Number(warnings?.payroll_warnings ?? 0),
      unresolved_expiry_alerts: Number(warnings?.unresolved_expiry_alerts ?? 0),
    },
    generated_at: new Date().toISOString(),
  };
};

export const getEmployeeProfileAttendance = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  requireProfilePermission(context, ["attendance.view", "attendance.reports.view", "dashboard.attendance.view"], "You do not have permission to view employee attendance.");
  await ensureEmployeeAccess(env, context, employeeId);
  const safeLimit = profileLimit(limit);
  const [summary, recent_rows, source_summary] = await Promise.all([
    employeesRepository.profileAttendanceSummary(env, context.companyId, employeeId, monthStart(), today()),
    employeesRepository.profileAttendanceRows(env, context.companyId, employeeId, safeLimit),
    employeesRepository.profileAttendanceSources(env, context.companyId, employeeId, 10),
  ]);

  return {
    today: recent_rows.find((row: any) => row.attendance_date === today()) ?? null,
    current_month_summary: {
      present_days: Number(summary?.present_days ?? 0),
      absent_days: Number(summary?.absent_days ?? 0),
      late_days: Number(summary?.late_days ?? 0),
      early_checkout_days: Number(summary?.early_checkout_days ?? 0),
      missing_punch_days: Number(summary?.missing_punch_days ?? 0),
      overtime_days: Number(summary?.overtime_days ?? 0),
      holiday_work_days: Number(summary?.holiday_work_days ?? 0),
    },
    recent_rows,
    source_summary,
    report_href: `/attendance/reports?employee_id=${encodeURIComponent(employeeId)}`,
  };
};

export const getEmployeeProfileLeave = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  requireProfilePermission(context, ["leave.view", "dashboard.leave.view"], "You do not have permission to view employee leave.");
  await ensureEmployeeAccess(env, context, employeeId);
  const safeLimit = profileLimit(limit);
  const [balances, recent_requests, transactions] = await Promise.all([
    employeesRepository.profileLeaveBalances(env, context.companyId, employeeId),
    employeesRepository.profileLeaveRequests(env, context.companyId, employeeId, safeLimit),
    permissionService.hasAnyPermission(context, ["leave.transactions.view", "leave.balances.view", "leave.view"])
      ? employeesRepository.profileLeaveTransactions(env, context.companyId, employeeId, safeLimit)
      : Promise.resolve([]),
  ]);
  return { balances, recent_requests, transactions };
};

export const getEmployeeProfileLongLeave = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  requireProfilePermission(context, ["long_leave.view", "dashboard.long_leave.view"], "You do not have permission to view employee long leave.");
  await ensureEmployeeAccess(env, context, employeeId);
  const safeLimit = profileLimit(limit);
  const [records, payroll_impacts] = await Promise.all([
    employeesRepository.profileLongLeave(env, context.companyId, employeeId, safeLimit),
    permissionService.hasAnyPermission(context, ["long_leave.payroll_preview", "payroll.view", "dashboard.payroll_readiness.view"])
      ? employeesRepository.profileLongLeaveImpacts(env, context.companyId, employeeId, safeLimit)
      : Promise.resolve([]),
  ]);
  return {
    active: records.find((row: any) => ["approved", "active", "extended"].includes(row.status)) ?? null,
    history: records,
    payroll_impacts,
  };
};

export const getEmployeeProfileDocuments = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  requireProfilePermission(context, ["documents.view"], "You do not have permission to view employee documents.");
  await ensureEmployeeAccess(env, context, employeeId);
  const includeSensitive = permissionService.hasPermission(context, "documents.view_sensitive");
  const rows = await employeesRepository.profileDocuments(env, context.companyId, employeeId, profileLimit(limit));
  return {
    documents: rows.map((row: any) => ({
      ...row,
      file_name: row.is_sensitive === 1 && !includeSensitive ? "Sensitive document" : row.file_name,
    })),
  };
};

export const getEmployeeProfileContracts = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  requireProfilePermission(context, ["employees.contracts.view", "contracts.view", "employees.view"], "You do not have permission to view employee contracts.");
  await ensureEmployeeAccess(env, context, employeeId);
  const contracts = await employeesRepository.profileContracts(env, context.companyId, employeeId, profileLimit(limit));
  return {
    active_contract: contracts.find((row: any) => row.contract_status === "active") ?? contracts[0] ?? null,
    contracts,
  };
};

export const getEmployeeProfileAssets = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  requireProfilePermission(context, ["assets.view", "uniforms.view"], "You do not have permission to view employee assets or uniforms.");
  await ensureEmployeeAccess(env, context, employeeId);
  const safeLimit = profileLimit(limit);
  const [assets, uniforms] = await Promise.all([
    permissionService.hasPermission(context, "assets.view")
      ? employeesRepository.profileAssets(env, context.companyId, employeeId, safeLimit)
      : Promise.resolve([]),
    permissionService.hasPermission(context, "uniforms.view")
      ? employeesRepository.profileUniforms(env, context.companyId, employeeId, safeLimit)
      : Promise.resolve([]),
  ]);
  return { assets, uniforms };
};

export const getEmployeeProfilePayrollReadiness = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  requireProfilePermission(context, ["payroll.view", "salary.view", "employees.salary.view", "dashboard.payroll_readiness.view"], "You do not have permission to view payroll readiness for this employee.");
  await ensureEmployeeAccess(env, context, employeeId);
  const safeLimit = profileLimit(limit);
  const [salary, attendance, long_leave_impacts, leave] = await Promise.all([
    employeesRepository.profileSalarySummary(env, context.companyId, employeeId),
    employeesRepository.profileAttendanceSummary(env, context.companyId, employeeId, monthStart(), today()),
    employeesRepository.profileLongLeaveImpacts(env, context.companyId, employeeId, safeLimit),
    employeesRepository.profileLeaveBalances(env, context.companyId, employeeId),
  ]);
  return {
    salary_summary: salary,
    attendance_exceptions_affecting_payroll: Number(attendance?.missing_punch_days ?? 0),
    long_leave_payroll_impact: long_leave_impacts,
    leave_balance_warnings: leave.filter((row: any) => Number(row.available_days ?? 0) < 0),
  };
};

export const getEmployeeProfileAlerts = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  requireProfilePermission(context, ["expiry_alerts.view", "expiry_alerts.view_own"], "You do not have permission to view employee alerts.");
  await ensureEmployeeProfileSectionAccess(env, context, employeeId, {
    scopedPermissions: ["expiry_alerts.view"],
    ownPermissions: ["expiry_alerts.view_own"],
    ownDeniedMessage: "You do not have permission to view employee alerts.",
  });
  const alerts = await employeesRepository.profileAlerts(env, context.companyId, employeeId, profileLimit(limit));
  return {
    alerts,
    open_count: alerts.filter((row: any) => ["open", "acknowledged", "snoozed"].includes(row.status)).length,
    critical_count: alerts.filter((row: any) => ["critical", "urgent", "high"].includes(row.severity)).length,
  };
};

export const getEmployeeProfileTimeline = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  requireProfilePermission(context, ["employees.view", "audit_logs.view"], "You do not have permission to view employee history.");
  await ensureEmployeeAccess(env, context, employeeId);
  const safeLimit = profileLimit(limit);
  const [statusHistory, jobHistory, leaveRequests, longLeave, documents, auditEvents] = await Promise.all([
    employeesRepository.profileStatusHistory(env, context.companyId, employeeId, safeLimit),
    employeesRepository.profileJobHistory(env, context.companyId, employeeId, safeLimit),
    employeesRepository.profileLeaveRequests(env, context.companyId, employeeId, 10),
    employeesRepository.profileLongLeave(env, context.companyId, employeeId, 10),
    permissionService.hasPermission(context, "documents.view")
      ? employeesRepository.profileDocuments(env, context.companyId, employeeId, 10)
      : Promise.resolve([]),
    permissionService.hasPermission(context, "audit_logs.view")
      ? employeesRepository.profileAuditTimeline(env, context.companyId, employeeId, safeLimit)
      : Promise.resolve([]),
  ]);
  const events = [
    ...statusHistory.map((row: any) => ({ id: row.id, type: "status", label: `Status changed to ${row.new_status}`, date: row.changed_at ?? row.created_at, reason: row.reason ?? null })),
    ...jobHistory.map((row: any) => ({ id: row.id, type: "job", label: `Job history: ${row.change_type}`, date: row.effective_from, reason: row.reason ?? null })),
    ...leaveRequests.map((row: any) => ({ id: row.id, type: "leave", label: `Leave ${row.status}`, date: row.start_date, reason: row.reason ?? null })),
    ...longLeave.map((row: any) => ({ id: row.id, type: "long_leave", label: `Long leave ${row.status}`, date: row.start_date, reason: row.reason ?? null })),
    ...documents.map((row: any) => ({ id: row.id, type: "document", label: `Document ${row.document_type}`, date: row.created_at, reason: null })),
    ...auditEvents.map((row: any) => ({ id: row.id, type: "audit", label: `${row.module}: ${row.action}`, date: row.created_at, reason: row.reason ?? null })),
  ]
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
    .slice(0, safeLimit);
  return { events };
};

export const getEmployeeProfile = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  limit?: number,
) => {
  const summary = await getEmployeeProfileSummary(env, context, employeeId);
  const section = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PermissionError) return null;
      throw error;
    }
  };

  const [attendance, leave, long_leave, documents, contracts, assets, payroll_readiness, alerts, timeline] = await Promise.all([
    section(() => getEmployeeProfileAttendance(env, context, employeeId, limit)),
    section(() => getEmployeeProfileLeave(env, context, employeeId, limit)),
    section(() => getEmployeeProfileLongLeave(env, context, employeeId, limit)),
    section(() => getEmployeeProfileDocuments(env, context, employeeId, limit)),
    section(() => getEmployeeProfileContracts(env, context, employeeId, limit)),
    section(() => getEmployeeProfileAssets(env, context, employeeId, limit)),
    section(() => getEmployeeProfilePayrollReadiness(env, context, employeeId, limit)),
    section(() => getEmployeeProfileAlerts(env, context, employeeId, limit)),
    section(() => getEmployeeProfileTimeline(env, context, employeeId, limit)),
  ]);

  return {
    summary,
    attendance,
    leave,
    long_leave,
    documents,
    contracts,
    assets,
    payroll_readiness,
    alerts,
    timeline,
    meta: {
      employee_id: employeeId,
      generated_at: new Date().toISOString(),
    },
  };
};

export const createEmployee = async (
  env: Env,
  context: AuthActor,
  input: EmployeeCreateInput,
) => {
  const { starting_salary: startingSalary, ...employeeInput } = input;
  const generatedInput = normalizeEmployeeForPersist({
    ...employeeInput,
    employee_code: await generateEmployeeCode(env, context.companyId),
  });

  ensureIdentityRequirements(generatedInput);
  await ensureReferenceData(env, context, generatedInput);
  await ensureUniqueIdentity(env, context.companyId, generatedInput);

  const employeeId = createEntityId("emp");
  const salaryHistoryId = createPrefixedId("salary_hist");

  try {
    await employeesRepository.createEmployeeOnboardingRecords(env, {
      employeeId,
      salaryHistoryId,
      jobHistoryId: createPrefixedId("job_hist"),
      statusHistoryId: createPrefixedId("status_hist"),
      companyId: context.companyId,
      employee: generatedInput,
      startingSalary,
      actorUserId: context.actorUserId,
      jobEffectiveFrom: generatedInput.joined_at ?? nowIso().slice(0, 10),
    });
  } catch (error) {
    throw new AppError({
      code: "EMPLOYEE_SALARY_HISTORY_CREATE_FAILED",
      title: "Employee salary could not be saved",
      message: "Employee could not be created because the starting salary could not be saved.",
      statusCode: 500,
      retryable: true,
      cause: error,
    });
  }
  await ensureAudit(env, context, {
    action: "employee_created",
    entityType: "employee",
    entityId: employeeId,
    employeeId,
    outletId: generatedInput.primary_outlet_id,
    newValue: generatedInput,
  });
  await ensureAudit(env, context, {
    action: "employee_salary_added",
    entityType: "employee_salary_history",
    entityId: salaryHistoryId,
    employeeId,
    outletId: generatedInput.primary_outlet_id,
    newValue: {
      monthly_salary_amount: startingSalary.monthly_salary_amount,
      currency: startingSalary.currency,
      effective_from: startingSalary.effective_from,
      reason: startingSalary.reason,
    },
    reason: startingSalary.reason,
  });
  await trackEmployeeSyncChange(env, context, {
    employeeId,
    outletId: generatedInput.primary_outlet_id,
    actionType: "created",
    payload: {
      employee_code: generatedInput.employee_code,
      full_name: generatedInput.full_name,
      employment_status: generatedInput.employment_status,
    },
  });
  await broadcast(env, context, "employees.created", { employee_id: employeeId });

  return {
    employee: await employeesRepository.findEmployeeById(
      env,
      context.companyId,
      employeeId,
    ),
  };
};

export const updateEmployee = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: EmployeeUpdateInput,
) => {
  const existing = await ensureEmployeeAccess(env, context, employeeId);

  if (existing.deleted_at) {
    throw new ValidationError("Please restore this employee before making changes.");
  }

  const merged = normalizeEmployeeForPersist(mergeEmployee(existing, normalizeEmployeeInput(input)));
  ensureIdentityRequirements(merged);
  await ensureReferenceData(env, context, merged);
  await ensureUniqueIdentity(env, context.companyId, merged, employeeId);

  const sensitiveFieldsChanged =
    input.id_card_number !== undefined ||
    input.passport_number !== undefined ||
    input.passport_expiry_date !== undefined ||
    input.work_permit_number !== undefined ||
    input.work_permit_expiry_date !== undefined ||
    input.bank_name !== undefined ||
    input.bank_account_masked !== undefined;

  if (sensitiveFieldsChanged && !hasSensitivePermission(context)) {
    throw new PermissionError("You do not have permission to update sensitive employee details.");
  }

  await employeesRepository.updateEmployee(
    env,
    context.companyId,
    employeeId,
    merged,
    context.actorUserId,
  );

  if (
    merged.primary_outlet_id !== existing.primary_outlet_id ||
    merged.department_id !== existing.department_id ||
    merged.position_id !== existing.position_id
  ) {
    await employeesRepository.createJobHistory(env, {
      id: createPrefixedId("job_hist"),
      companyId: context.companyId,
      employeeId,
      outletId: merged.primary_outlet_id,
      departmentId: merged.department_id,
      positionId: merged.position_id,
      changeType: "profile_update",
      effectiveFrom: nowIso().slice(0, 10),
      reason: "Employee updated",
      createdBy: context.actorUserId,
    });
  }

  await ensureAudit(env, context, {
    action: "employee_updated",
    entityType: "employee",
    entityId: employeeId,
    employeeId,
    outletId: merged.primary_outlet_id,
    oldValue: existing,
    newValue: merged,
  });
  await trackEmployeeSyncChange(env, context, {
    employeeId,
    outletId: merged.primary_outlet_id,
    actionType: "updated",
    payload: {
      employee_code: merged.employee_code,
      full_name: merged.full_name,
      employment_status: merged.employment_status,
    },
  });
  await broadcast(env, context, "employees.updated", { employee_id: employeeId });

  return {
    employee: await getEmployee(env, context, employeeId),
  };
};

export const archiveEmployee = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  reason: string,
) => {
  const existing = await ensureEmployeeAccess(env, context, employeeId);
  const merged = mergeEmployee(existing, {
    employment_status: "archived",
  });

  merged.deleted_at = nowIso();
  await employeesRepository.updateEmployee(
    env,
    context.companyId,
    employeeId,
    merged,
    context.actorUserId,
  );
  await employeesRepository.createStatusHistory(env, {
    id: createPrefixedId("status_hist"),
    companyId: context.companyId,
    employeeId,
    oldStatus: existing.employment_status,
    newStatus: "archived",
    reason,
    changedBy: context.actorUserId,
  });
  await disableLinkedUserLogins(env, context, employeeId, reason);
  await ensureAudit(env, context, {
    action: "employee_archived",
    entityType: "employee",
    entityId: employeeId,
    employeeId,
    outletId: existing.primary_outlet_id,
    oldValue: existing,
    newValue: merged,
    reason,
  });
  await trackEmployeeSyncChange(env, context, {
    employeeId,
    outletId: existing.primary_outlet_id,
    actionType: "archived",
    payload: { employment_status: "archived" },
  });
  await broadcast(env, context, "employees.archived", { employee_id: employeeId });

  return { archived: true };
};

export const restoreEmployee = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  reason: string,
) => {
  const existing = await ensureEmployeeAccess(env, context, employeeId);
  const merged = mergeEmployee(existing, {
    employment_status: "active",
  });

  merged.deleted_at = null;
  await employeesRepository.updateEmployee(
    env,
    context.companyId,
    employeeId,
    merged,
    context.actorUserId,
  );
  await employeesRepository.createStatusHistory(env, {
    id: createPrefixedId("status_hist"),
    companyId: context.companyId,
    employeeId,
    oldStatus: existing.employment_status,
    newStatus: "active",
    reason,
    changedBy: context.actorUserId,
  });
  await ensureAudit(env, context, {
    action: "employee_restored",
    entityType: "employee",
    entityId: employeeId,
    employeeId,
    outletId: existing.primary_outlet_id,
    oldValue: existing,
    newValue: merged,
    reason,
  });
  await trackEmployeeSyncChange(env, context, {
    employeeId,
    outletId: existing.primary_outlet_id,
    actionType: "restored",
    payload: { employment_status: "active" },
  });
  await broadcast(env, context, "employees.restored", { employee_id: employeeId });

  return { restored: true };
};

const allowedStatusTransitions: Record<string, string[]> = {
  active: ["suspended", "resigned", "terminated", "retired", "inactive", "on_leave", "long_leave"],
  probation: ["confirmed", "suspended", "resigned", "terminated", "retired", "inactive"],
  confirmed: ["suspended", "resigned", "terminated", "retired", "inactive", "on_leave", "long_leave"],
  on_leave: ["active", "confirmed", "suspended", "resigned", "terminated", "retired"],
  long_leave: ["active", "confirmed", "resigned", "terminated", "retired"],
  suspended: ["active", "confirmed", "resigned", "terminated", "inactive"],
  resigned: ["rehired"],
  terminated: ["rehired"],
  retired: ["rehired"],
  inactive: ["rehired", "active", "probation"],
  rehired: ["active", "probation", "confirmed", "suspended", "resigned", "terminated"],
  archived: ["active"],
};

const isValidEmploymentStatus = (status: string) =>
  (EMPLOYMENT_STATUSES as readonly string[]).includes(status);

const assertStatusTransitionAllowed = (
  context: AuthActor,
  currentStatus: string,
  newStatus: string,
  input: EmployeeStatusInput,
) => {
  if (!isValidEmploymentStatus(newStatus)) {
    throw new AppError({
      code: "INVALID_EMPLOYEE_STATUS",
      title: "Invalid employee status",
      message: "Please select a valid employee status.",
      statusCode: 400,
      retryable: false,
    });
  }

  if (currentStatus === newStatus) return;

  const allowed = allowedStatusTransitions[currentStatus] ?? [];
  if (allowed.includes(newStatus)) return;

  if (input.override_invalid_transition && context.isSuperAdmin && input.override_reason) {
    return;
  }

  throw new AppError({
    code: "INVALID_EMPLOYEE_STATUS_TRANSITION",
    title: "Invalid employee status transition",
    message: "This employee status change is not allowed without a Super Admin override reason.",
    statusCode: 409,
    retryable: false,
    fieldErrors: {
      new_status: "Choose a valid next status or provide an authorized override reason.",
    },
  });
};

const assertStatusEffectiveDateNotFinalized = async (
  env: Env,
  companyId: string,
  effectiveFrom: string,
) => {
  const finalizedPayrollRun = await employeesRepository.findFinalizedPayrollRunByMonth(
    env,
    companyId,
    effectiveFrom.slice(0, 7),
  );

  if (finalizedPayrollRun) {
    throw new AppError({
      code: "EMPLOYEE_STATUS_FINALIZED_PERIOD_LOCKED",
      title: "Finalized payroll period",
      message: "Employee status changes cannot affect a finalized payroll period.",
      statusCode: 423,
      retryable: false,
      fieldErrors: {
        effective_from: "Choose an effective date outside finalized payroll periods.",
      },
    });
  }
};

const assertStatusSchedulingSupported = (effectiveFrom: string) => {
  if (effectiveFrom > todayIso()) {
    throw new AppError({
      code: "EMPLOYEE_STATUS_SCHEDULING_NOT_SUPPORTED",
      title: "Scheduled status changes not available",
      message: "Future-dated employee status changes require scheduled activation and are not available yet.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        effective_from: "Choose today or an earlier unlocked date.",
      },
    });
  }
};

const isPayrollEligibleStatus = (status: string) =>
  (EMPLOYEE_PAYROLL_ELIGIBLE_STATUSES as readonly string[]).includes(status);

const isExitStatus = (status: string) =>
  (EMPLOYEE_EXIT_STATUSES as readonly string[]).includes(status);

export const changeStatus = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: EmployeeStatusInput,
) => {
  const existing = await ensureEmployeeAccess(env, context, employeeId);
  const effectiveFrom = input.effective_from ?? input.effective_date ?? todayIso();

  assertStatusSchedulingSupported(effectiveFrom);
  await assertStatusEffectiveDateNotFinalized(env, context.companyId, effectiveFrom);
  assertStatusTransitionAllowed(context, existing.employment_status, input.new_status, input);

  // Phase 7A approval handoff is intentionally deferred until the approval workflow
  // can apply status changes idempotently; high-risk changes remain immediate,
  // permission-gated, reason-required, and audited while approval settings default off.
  const merged = mergeEmployee(existing, {
    employment_status: input.new_status,
  });

  if (input.new_status === "resigned") {
    merged.resigned_at = effectiveFrom;
    merged.terminated_at = null;
  }

  if (isExitStatus(input.new_status) && !["archived", "resigned"].includes(input.new_status)) {
    merged.terminated_at = effectiveFrom;
    merged.resigned_at = null;
  }

  if (input.new_status === "rehired") {
    merged.resigned_at = null;
    merged.terminated_at = null;
  }

  if (["active", "probation", "confirmed"].includes(input.new_status)) {
    merged.resigned_at = null;
    merged.terminated_at = null;
  }

  await employeesRepository.applyEmployeeStatusChange(env, {
    companyId: context.companyId,
    employeeId,
    employee: merged,
    actorUserId: context.actorUserId,
    statusHistory: {
      id: createPrefixedId("status_hist"),
      oldStatus: existing.employment_status,
      newStatus: input.new_status,
      effectiveFrom,
      reason: input.reason,
      notes: input.notes ?? input.override_reason ?? null,
    },
  });

  const accessDefaults = EMPLOYEE_STATUS_ACCESS_DEFAULTS[input.new_status];
  const disableUserAccess = input.disable_user_access ?? accessDefaults?.disableUserAccess ?? false;
  const revokeActiveSessions = input.revoke_active_sessions ?? accessDefaults?.revokeActiveSessions ?? false;
  if (disableUserAccess || revokeActiveSessions) {
    await disableLinkedUserLogins(env, context, employeeId, input.reason, {
      disableUserAccess,
      revokeActiveSessions,
    });
  }
  await ensureAudit(env, context, {
    action: input.new_status === "suspended"
      ? "EMPLOYEE_SUSPENDED"
      : input.new_status === "terminated"
        ? "EMPLOYEE_TERMINATED"
        : input.new_status === "resigned"
          ? "EMPLOYEE_RESIGNED"
          : input.new_status === "rehired"
            ? "EMPLOYEE_REHIRED"
            : "EMPLOYEE_STATUS_CHANGED",
    entityType: "employee",
    entityId: employeeId,
    employeeId,
    outletId: existing.primary_outlet_id,
    oldValue: existing,
    newValue: {
      ...merged,
      scheduled_status: null,
      effective_from: effectiveFrom,
      disable_user_access: disableUserAccess,
      revoke_active_sessions: revokeActiveSessions,
      override_invalid_transition: input.override_invalid_transition ?? false,
    },
    reason: input.reason,
  });
  await trackEmployeeSyncChange(env, context, {
    employeeId,
    outletId: existing.primary_outlet_id,
    actionType: "status_changed",
    payload: { employment_status: input.new_status },
  });
  await broadcast(env, context, "employees.status_changed", { employee_id: employeeId, status: input.new_status, effective_from: effectiveFrom });

  return {
    updated: true,
    scheduled: false,
    employee: await getEmployee(env, context, employeeId),
    status_history: await employeesRepository.listStatusHistory(env, context.companyId, employeeId).then((rows) => rows[0] ?? null),
    user_access: {
      disabled: disableUserAccess,
      sessions_revoked: revokeActiveSessions,
    },
  };
};

export const assignOutlet = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: OutletAssignmentInput,
) => {
  const existing = await ensureEmployeeAccess(env, context, employeeId);
  const merged = mergeEmployee(existing, { primary_outlet_id: input.outlet_id });

  await ensureReferenceData(env, context, merged);
  await employeesRepository.updateEmployee(
    env,
    context.companyId,
    employeeId,
    merged,
    context.actorUserId,
  );
  await employeesRepository.createJobHistory(env, {
    id: createPrefixedId("job_hist"),
    companyId: context.companyId,
    employeeId,
    outletId: input.outlet_id,
    departmentId: existing.department_id,
    positionId: existing.position_id,
    changeType: "outlet_assignment",
    effectiveFrom: input.effective_from,
    reason: input.reason,
    createdBy: context.actorUserId,
  });
  await ensureAudit(env, context, {
    action: "employee_outlet_changed",
    entityType: "employee",
    entityId: employeeId,
    employeeId,
    outletId: input.outlet_id,
    oldValue: { primary_outlet_id: existing.primary_outlet_id },
    newValue: { primary_outlet_id: input.outlet_id },
    reason: input.reason,
  });
  if (existing.primary_outlet_id && existing.primary_outlet_id !== input.outlet_id) {
    await trackEmployeeSyncChange(env, context, {
      employeeId,
      outletId: existing.primary_outlet_id,
      actionType: "outlet_removed",
      payload: {
        employee_id: employeeId,
        no_longer_assigned_to_outlet: existing.primary_outlet_id,
      },
    });
  }
  await trackEmployeeSyncChange(env, context, {
    employeeId,
    outletId: input.outlet_id,
    actionType: "outlet_added",
    payload: {
      employee_id: employeeId,
      primary_outlet_id: input.outlet_id,
    },
  });

  return { updated: true };
};

const salaryApprovalType = (changeType: SalaryHistoryInput["change_type"]) => {
  if (changeType === "increment") return "salary_increment";
  if (changeType === "correction") return "salary_correction";
  if (changeType === "contract_change") return "contract_salary_change";
  return "other_salary_change";
};

const approvalRequestResponse = (
  approvalRequestId: string | null,
  type: string,
  employeeId: string,
  effectiveFrom: string,
) => ({
  id: approvalRequestId,
  type,
  status: "pending",
  employee_id: employeeId,
  effective_from: effectiveFrom,
});

const auditAutoApplyNoEligibleApprover = async (
  env: Env,
  context: AuthActor,
  input: {
    employee: EmployeeRecord;
    entityType: string;
    action: "APPROVAL_AUTO_APPLIED_NO_ELIGIBLE_APPROVER" | "APPROVAL_AUTO_APPLY_FAILED";
    payload: Record<string, unknown>;
    reason?: string | null;
  },
) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.employee.primary_outlet_id ?? undefined,
    module: "approvals",
    action: input.action,
    severity: input.action === "APPROVAL_AUTO_APPLY_FAILED" ? "error" : "warning",
    entityType: input.entityType,
    entityId: input.employee.id,
    employeeId: input.employee.id,
    actorId: context.actorUserId,
    newValueJson: JSON.stringify({
      workflow_key: "salary_increment",
      auto_apply_when_no_eligible_approver: true,
      ...input.payload,
    }),
    reason: input.reason ?? undefined,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Approval auto-apply audit log could not be recorded", {
      employeeId: input.employee.id,
      action: input.action,
      requestId: context.requestId,
      error,
    });
  });
};

const isNoEligibleAutoApplyDecision = (
  approval: unknown,
): approval is { auto_applied_no_eligible_approver: true } =>
  Boolean(
    approval &&
    typeof approval === "object" &&
    (approval as { auto_applied_no_eligible_approver?: unknown }).auto_applied_no_eligible_approver === true,
  );

const createSalaryApprovalIfRequired = async (
  env: Env,
  context: AuthActor,
  employee: EmployeeRecord,
  input: SalaryHistoryInput,
  currentSalary: Awaited<ReturnType<typeof employeesRepository.findActiveSalaryAtOrBefore>>,
) => {
  const salaryApprovalSettings = await settingsService.getSalaryApprovalSettings(env, context.companyId);
  if (
    salaryApprovalSettings.salary_change_approval_enabled === false ||
    (input.change_type === "correction" && salaryApprovalSettings.salary_correction_approval_enabled === false)
  ) {
    return null;
  }
  const type = salaryApprovalType(input.change_type);
  const payload: SalaryApprovalPayload = {
    approval_action: "salary_change",
    approval_type: type,
    employee_id: employee.id,
    current_salary_record_id: currentSalary?.id ?? null,
    old_monthly_salary_amount: currentSalary?.monthly_salary_amount ?? null,
    old_currency: currentSalary?.currency ?? null,
    old_effective_from: currentSalary?.effective_from ?? null,
    proposed_salary: input,
    requested_by: context.actorUserId,
  };
  const approval = await createApprovalRequestForWorkflow(env, context, {
    workflowKey: "salary_increment",
    module: "salary",
    entityType: type,
    entityId: employee.id,
    employeeId: employee.id,
    summary: `Salary change for ${employee.full_name}`,
    payload,
    amount: input.monthly_salary_amount,
    currency: input.currency ?? currentSalary?.currency ?? "MVR",
  });

  if (!approval?.approval_required || !approval.approval_request_id) {
    return isNoEligibleAutoApplyDecision(approval) ? approval : null;
  }
  const existingApproval = "existing" in approval && approval.existing === true;

  await createAuditLog(env, {
    companyId: context.companyId,
    outletId: employee.primary_outlet_id ?? undefined,
    module: "employees",
    action: "SALARY_CHANGE_APPROVAL_REQUESTED",
    severity: "info",
    entityType: "approval_request",
    entityId: approval.approval_request_id ?? employee.id,
    employeeId: employee.id,
    actorId: context.actorUserId,
    oldValueJson: JSON.stringify({
      salary_record_id: currentSalary?.id ?? null,
      monthly_salary_amount: currentSalary?.monthly_salary_amount ?? null,
      currency: currentSalary?.currency ?? null,
    }),
    newValueJson: JSON.stringify({
      monthly_salary_amount: input.monthly_salary_amount,
      currency: input.currency ?? "MVR",
      effective_from: input.effective_from,
      change_type: input.change_type,
      approval_request_id: approval.approval_request_id,
      existing: existingApproval,
    }),
    reason: input.reason,
    approvalRequestId: approval.approval_request_id ?? undefined,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Salary approval request audit log could not be recorded", {
      employeeId: employee.id,
      approvalRequestId: approval.approval_request_id,
      requestId: context.requestId,
      error,
    });
  });

  return {
    approval_required: true,
    approval_request_id: approval.approval_request_id,
    approval_request: approvalRequestResponse(approval.approval_request_id, type, employee.id, input.effective_from),
    existing_approval_request: existingApproval,
  };
};

const createJobSalaryApprovalIfRequired = async (
  env: Env,
  context: AuthActor,
  employee: EmployeeRecord,
  input: JobChangeInput,
  salaryInput: SalaryHistoryInput,
  currentSalary: Awaited<ReturnType<typeof employeesRepository.findActiveSalaryAtOrBefore>>,
) => {
  const salaryApprovalSettings = await settingsService.getSalaryApprovalSettings(env, context.companyId);
  if (!salaryApprovalSettings.promotion_salary_change_approval_enabled) {
    return null;
  }
  const type = "promotion_with_salary_change";
  const payload: JobSalaryApprovalPayload = {
    approval_action: "job_change_with_salary",
    approval_type: type,
    employee_id: employee.id,
    expected_job: {
      outlet_id: employee.primary_outlet_id ?? null,
      department_id: employee.department_id ?? null,
      position_id: employee.position_id ?? null,
    },
    current_salary_record_id: currentSalary?.id ?? null,
    old_monthly_salary_amount: currentSalary?.monthly_salary_amount ?? null,
    old_currency: currentSalary?.currency ?? null,
    job_change: input,
    requested_by: context.actorUserId,
  };
  const approval = await createApprovalRequestForWorkflow(env, context, {
    workflowKey: "salary_increment",
    module: "salary",
    entityType: type,
    entityId: employee.id,
    employeeId: employee.id,
    summary: `Promotion with salary change for ${employee.full_name}`,
    payload,
    amount: salaryInput.monthly_salary_amount,
    currency: salaryInput.currency ?? currentSalary?.currency ?? "MVR",
  });

  if (!approval?.approval_required || !approval.approval_request_id) {
    return isNoEligibleAutoApplyDecision(approval) ? approval : null;
  }
  const existingApproval = "existing" in approval && approval.existing === true;

  await createAuditLog(env, {
    companyId: context.companyId,
    outletId: employee.primary_outlet_id ?? undefined,
    module: "employees",
    action: "PROMOTION_APPROVAL_REQUESTED",
    severity: "info",
    entityType: "approval_request",
    entityId: approval.approval_request_id ?? employee.id,
    employeeId: employee.id,
    actorId: context.actorUserId,
    oldValueJson: JSON.stringify({
      outlet_id: employee.primary_outlet_id ?? null,
      department_id: employee.department_id ?? null,
      position_id: employee.position_id ?? null,
      salary_record_id: currentSalary?.id ?? null,
      monthly_salary_amount: currentSalary?.monthly_salary_amount ?? null,
    }),
    newValueJson: JSON.stringify({
      outlet_id: input.new_outlet_id,
      department_id: input.new_department_id,
      position_id: input.new_position_id,
      salary: {
        monthly_salary_amount: salaryInput.monthly_salary_amount,
        currency: salaryInput.currency ?? "MVR",
        effective_from: salaryInput.effective_from,
        change_type: salaryInput.change_type,
      },
      approval_request_id: approval.approval_request_id,
      existing: existingApproval,
    }),
    reason: input.reason,
    approvalRequestId: approval.approval_request_id ?? undefined,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Promotion approval request audit log could not be recorded", {
      employeeId: employee.id,
      approvalRequestId: approval.approval_request_id,
      requestId: context.requestId,
      error,
    });
  });

  return {
    approval_required: true,
    approval_request_id: approval.approval_request_id,
    approval_request: approvalRequestResponse(approval.approval_request_id, type, employee.id, input.effective_from),
    existing_approval_request: existingApproval,
  };
};

const applyJobChangeNow = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: JobChangeInput,
  options: {
    skipPermissionCheck?: boolean;
    approvalRequestId?: string;
    expectedJob?: { outlet_id: string | null; department_id: string | null; position_id: string | null };
    expectedCurrentSalaryId?: string | null;
  } = {},
) => {
  if (!options.skipPermissionCheck && !canManageJobChanges(context)) {
    throw new PermissionError(
      "You do not have permission to record employee job changes.",
      "JOB_CHANGE_PERMISSION_DENIED",
    );
  }

  const existing = await ensureEmployeeAccess(env, context, employeeId);
  if (
    options.expectedJob &&
    (
      (existing.primary_outlet_id ?? null) !== options.expectedJob.outlet_id ||
      (existing.department_id ?? null) !== options.expectedJob.department_id ||
      (existing.position_id ?? null) !== options.expectedJob.position_id
    )
  ) {
    throw new AppError({
      code: "JOB_STATE_CHANGED",
      title: "Job state changed",
      message: "This approval request is no longer current because the employee job details changed.",
      statusCode: 409,
      retryable: false,
    });
  }
  const nextOutletId =
    input.new_outlet_id !== undefined && input.new_outlet_id !== null
      ? input.new_outlet_id
      : existing.primary_outlet_id;
  const nextDepartmentId =
    input.new_department_id !== undefined
      ? input.new_department_id
      : existing.department_id;
  const nextPositionId =
    input.new_position_id !== undefined
      ? input.new_position_id
      : existing.position_id;
  const merged = mergeEmployee(existing, {
    primary_outlet_id: nextOutletId ?? undefined,
    department_id: nextDepartmentId,
    position_id: nextPositionId,
  });
  const outletChanged = nextOutletId !== existing.primary_outlet_id;
  const departmentChanged = nextDepartmentId !== existing.department_id;
  const positionChanged = nextPositionId !== existing.position_id;
  const salaryEnabled = input.salary_change?.enabled === true;

  if (!outletChanged && !departmentChanged && !positionChanged && input.change_type !== "correction") {
    throw new AppError({
      code: "JOB_CHANGE_NO_FIELDS_CHANGED",
      title: "No job fields changed",
      message: "Choose at least one job field to change before saving.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        change: "Choose at least one new outlet, department, or position.",
      },
    });
  }

  if (salaryEnabled && !options.skipPermissionCheck && !canManageSalaryChanges(context)) {
    throw new PermissionError(
      "You do not have permission to update employee salary history.",
      "SALARY_PERMISSION_DENIED",
    );
  }

  const outlet = nextOutletId
    ? await employeesRepository.findActiveOutlet(env, context.companyId, nextOutletId)
    : null;
  if (!nextOutletId || !outlet || outlet.status !== "active") {
    throw new AppError({
      code: "INVALID_OUTLET",
      title: "Invalid outlet",
      message: "Please choose an active outlet.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { new_outlet_id: "Please choose an active outlet." },
    });
  }
  if (!permissionService.hasOutletAccess(context, nextOutletId)) {
    throw new OutletAccessError("You do not have access to the selected outlet.");
  }

  const department = nextDepartmentId
    ? await employeesRepository.findDepartment(env, context.companyId, nextDepartmentId)
    : null;
  if (nextDepartmentId && (!department || department.status !== "active")) {
    throw new AppError({
      code: "INVALID_DEPARTMENT",
      title: "Invalid department",
      message: "Please choose an active department.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { new_department_id: "Please choose an active department." },
    });
  }

  const position = nextPositionId
    ? await employeesRepository.findPosition(env, context.companyId, nextPositionId)
    : null;
  if (nextPositionId && (!position || position.status !== "active")) {
    throw new AppError({
      code: "INVALID_POSITION",
      title: "Invalid position",
      message: "Please choose an active position.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { new_position_id: "Please choose an active position." },
    });
  }
  if (position?.department_id && nextDepartmentId && position.department_id !== nextDepartmentId) {
    throw new AppError({
      code: "INVALID_POSITION",
      title: "Invalid position",
      message: "The selected position does not belong to the selected department.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { new_position_id: "Choose a position that belongs to the selected department." },
    });
  }

  const salaryInput: SalaryHistoryInput | null = salaryEnabled && input.salary_change?.monthly_salary_amount
    ? {
        monthly_salary_amount: input.salary_change.monthly_salary_amount,
        currency: input.salary_change.currency ?? "MVR",
        effective_from: input.effective_from,
        change_type: input.salary_change.change_type === "promotion"
          ? "promotion"
          : input.salary_change.change_type ?? "contract_change",
        reason: input.salary_change.reason ?? input.reason,
      }
    : null;
  const salaryPreparation = salaryInput
    ? await prepareSalaryTimelineChange(env, context, employeeId, salaryInput)
    : null;
  if (
    salaryInput &&
    options.expectedCurrentSalaryId !== undefined &&
    (salaryPreparation?.currentSalary?.id ?? null) !== options.expectedCurrentSalaryId
  ) {
    throw new AppError({
      code: "SALARY_TIMELINE_CHANGED",
      title: "Salary timeline changed",
      message: "This approval request is no longer current because the employee salary history changed.",
      statusCode: 409,
      retryable: false,
    });
  }
  const jobHistoryId = createPrefixedId("job_hist");

  try {
    await employeesRepository.createJobChangeWithOptionalSalary(env, {
      jobHistoryId,
      salaryHistoryId: salaryPreparation?.id ?? null,
      companyId: context.companyId,
      employeeId,
      actorUserId: context.actorUserId,
      job: {
        oldOutletId: existing.primary_outlet_id,
        newOutletId: nextOutletId,
        oldDepartmentId: existing.department_id,
        newDepartmentId: nextDepartmentId,
        oldPositionId: existing.position_id,
        newPositionId: nextPositionId,
        changeType: input.change_type,
        effectiveFrom: input.effective_from,
        reason: input.reason,
      },
      salary: salaryInput,
      approvalRequestId: options.approvalRequestId,
      closePreviousSalary: salaryPreparation?.currentSalary
        ? {
            id: salaryPreparation.currentSalary.id,
            effectiveTo: dayBefore(input.effective_from),
          }
        : null,
    });
  } catch (error) {
    console.error("Employee job change could not be saved", {
      employeeId,
      requestId: context.requestId,
      error,
    });
    throw new AppError({
      code: "JOB_CHANGE_CREATE_FAILED",
      title: "Job change could not be saved",
      message: "Job change could not be saved. Please try again.",
      statusCode: 500,
      retryable: true,
    });
  }

  const auditAction =
    input.change_type === "promotion"
      ? "employee_promotion_created"
      : input.change_type === "transfer"
        ? "employee_transfer_created"
        : "employee_job_change_created";
  const oldSalary = salaryPreparation?.currentSalary
    ? {
        monthly_salary_amount: salaryPreparation.currentSalary.monthly_salary_amount,
        currency: salaryPreparation.currentSalary.currency,
        effective_from: salaryPreparation.currentSalary.effective_from,
      }
    : null;
  await createAuditLog(env, {
    companyId: context.companyId,
    outletId: nextOutletId ?? undefined,
    module: "employees",
    action: auditAction,
    severity: "info",
    entityType: "employee_job_history",
    entityId: jobHistoryId,
    employeeId,
    actorId: context.actorUserId,
    oldValueJson: JSON.stringify({
      department_id: existing.department_id,
      position_id: existing.position_id,
      outlet_id: existing.primary_outlet_id,
      salary: oldSalary,
    }),
    newValueJson: JSON.stringify({
      department_id: nextDepartmentId,
      position_id: nextPositionId,
      outlet_id: nextOutletId,
      salary_changed: Boolean(salaryInput),
      salary: salaryInput
        ? {
            monthly_salary_amount: salaryInput.monthly_salary_amount,
            currency: salaryInput.currency ?? "MVR",
            effective_from: salaryInput.effective_from,
            change_type: salaryInput.change_type,
          }
        : null,
    }),
    reason: input.reason,
    approvalRequestId: options.approvalRequestId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Employee job change audit log could not be recorded", {
      employeeId,
      requestId: context.requestId,
      error,
    });
  });

  if (existing.primary_outlet_id && existing.primary_outlet_id !== nextOutletId) {
    await trackEmployeeSyncChange(env, context, {
      employeeId,
      outletId: existing.primary_outlet_id,
      actionType: "outlet_removed",
      payload: {
        employee_id: employeeId,
        no_longer_assigned_to_outlet: existing.primary_outlet_id,
      },
    });
  }
  await trackEmployeeSyncChange(env, context, {
    employeeId,
    outletId: nextOutletId,
    actionType: outletChanged ? "outlet_added" : "updated",
    payload: {
      employee_id: employeeId,
      primary_outlet_id: nextOutletId,
      department_id: nextDepartmentId,
      position_id: nextPositionId,
    },
  });
  await broadcast(env, context, "employees.job_changed", { employee_id: employeeId });

  return {
    employee: await getEmployee(env, context, employeeId),
    job_change: {
      id: jobHistoryId,
      change_type: input.change_type,
      effective_from: input.effective_from,
      old_position_id: existing.position_id,
      new_position_id: nextPositionId,
      old_department_id: existing.department_id,
      new_department_id: nextDepartmentId,
      old_outlet_id: existing.primary_outlet_id,
      new_outlet_id: nextOutletId,
      reason: input.reason,
    },
    salary_change: salaryPreparation?.id
      ? await employeesRepository.findSalaryHistoryById(
          env,
          context.companyId,
          employeeId,
          salaryPreparation.id,
        )
      : null,
  };
};

const prepareJobSalaryApprovalProposal = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: JobChangeInput,
) => {
  if (!canManageJobChanges(context)) {
    throw new PermissionError(
      "You do not have permission to record employee job changes.",
      "JOB_CHANGE_PERMISSION_DENIED",
    );
  }
  if (!canManageSalaryChanges(context)) {
    throw new PermissionError(
      "You do not have permission to update employee salary history.",
      "SALARY_PERMISSION_DENIED",
    );
  }

  const existing = await ensureEmployeeAccess(env, context, employeeId);
  const nextOutletId =
    input.new_outlet_id !== undefined && input.new_outlet_id !== null
      ? input.new_outlet_id
      : existing.primary_outlet_id;
  const nextDepartmentId =
    input.new_department_id !== undefined
      ? input.new_department_id
      : existing.department_id;
  const nextPositionId =
    input.new_position_id !== undefined
      ? input.new_position_id
      : existing.position_id;
  const outletChanged = nextOutletId !== existing.primary_outlet_id;
  const departmentChanged = nextDepartmentId !== existing.department_id;
  const positionChanged = nextPositionId !== existing.position_id;

  if (!outletChanged && !departmentChanged && !positionChanged && input.change_type !== "correction") {
    throw new AppError({
      code: "JOB_CHANGE_NO_FIELDS_CHANGED",
      title: "No job fields changed",
      message: "Choose at least one job field to change before saving.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        change: "Choose at least one new outlet, department, or position.",
      },
    });
  }

  const outlet = nextOutletId
    ? await employeesRepository.findActiveOutlet(env, context.companyId, nextOutletId)
    : null;
  if (!nextOutletId || !outlet || outlet.status !== "active") {
    throw new AppError({
      code: "INVALID_OUTLET",
      title: "Invalid outlet",
      message: "Please choose an active outlet.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { new_outlet_id: "Please choose an active outlet." },
    });
  }
  if (!permissionService.hasOutletAccess(context, nextOutletId)) {
    throw new OutletAccessError("You do not have access to the selected outlet.");
  }

  const department = nextDepartmentId
    ? await employeesRepository.findDepartment(env, context.companyId, nextDepartmentId)
    : null;
  if (nextDepartmentId && (!department || department.status !== "active")) {
    throw new AppError({
      code: "INVALID_DEPARTMENT",
      title: "Invalid department",
      message: "Please choose an active department.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { new_department_id: "Please choose an active department." },
    });
  }

  const position = nextPositionId
    ? await employeesRepository.findPosition(env, context.companyId, nextPositionId)
    : null;
  if (nextPositionId && (!position || position.status !== "active")) {
    throw new AppError({
      code: "INVALID_POSITION",
      title: "Invalid position",
      message: "Please choose an active position.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { new_position_id: "Please choose an active position." },
    });
  }
  if (position?.department_id && nextDepartmentId && position.department_id !== nextDepartmentId) {
    throw new AppError({
      code: "INVALID_POSITION",
      title: "Invalid position",
      message: "The selected position does not belong to the selected department.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { new_position_id: "Choose a position that belongs to the selected department." },
    });
  }

  const salaryInput: SalaryHistoryInput = {
    monthly_salary_amount: input.salary_change?.monthly_salary_amount ?? 0,
    currency: input.salary_change?.currency ?? "MVR",
    effective_from: input.effective_from,
    change_type: input.salary_change?.change_type === "promotion"
      ? "promotion"
      : input.salary_change?.change_type ?? "contract_change",
    reason: input.salary_change?.reason ?? input.reason,
  };
  const salaryPreparation = await prepareSalaryTimelineChange(env, context, employeeId, salaryInput);
  return { existing, salaryInput, salaryPreparation };
};

export const changeJob = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: JobChangeInput,
) => {
  if (input.salary_change?.enabled === true) {
    const proposal = await prepareJobSalaryApprovalProposal(env, context, employeeId, input);
    const approval = await createJobSalaryApprovalIfRequired(
      env,
      context,
      proposal.existing,
      input,
      proposal.salaryInput,
      proposal.salaryPreparation.currentSalary,
    );
    if (approval?.approval_required) return approval;
    try {
      const applied = await applyJobChangeNow(env, context, employeeId, input);
      if (isNoEligibleAutoApplyDecision(approval)) {
        await auditAutoApplyNoEligibleApprover(env, context, {
          employee: proposal.existing,
          entityType: "promotion_with_salary_change",
          action: "APPROVAL_AUTO_APPLIED_NO_ELIGIBLE_APPROVER",
          payload: {
            module: "salary",
            entity_type: "promotion_with_salary_change",
            job_change_applied: true,
          },
          reason: input.reason,
        });
      }
      return applied;
    } catch (error) {
      if (isNoEligibleAutoApplyDecision(approval)) {
        await auditAutoApplyNoEligibleApprover(env, context, {
          employee: proposal.existing,
          entityType: "promotion_with_salary_change",
          action: "APPROVAL_AUTO_APPLY_FAILED",
          payload: {
            module: "salary",
            entity_type: "promotion_with_salary_change",
            error: error instanceof Error ? error.message : "Promotion with salary change could not be applied.",
          },
          reason: input.reason,
        });
      }
      throw error;
    }
  }

  return applyJobChangeNow(env, context, employeeId, input);
};

export const listJobHistory = async (env: Env, context: AuthActor, employeeId: string) => {
  await ensureEmployeeAccess(env, context, employeeId);
  return employeesRepository.listJobHistory(env, context.companyId, employeeId);
};

export const listStatusHistory = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  await ensureEmployeeAccess(env, context, employeeId);
  return employeesRepository.listStatusHistory(env, context.companyId, employeeId);
};

export const getEmployeePayrollEligibilityForPeriod = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PayrollEligibilityResult> => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  const history = await employeesRepository.listStatusHistory(env, context.companyId, employeeId);
  const warnings: string[] = [];
  const segments: PayrollEligibilityResult["status_segments"] = [];

  const relevantHistory = history
    .filter((row) => (row.effective_from ?? row.changed_at ?? "") <= periodEnd)
    .sort((a, b) => String(a.effective_from ?? a.changed_at ?? "").localeCompare(String(b.effective_from ?? b.changed_at ?? "")));

  let currentStatus = relevantHistory[0]?.old_status ?? employee.employment_status;
  let cursor = periodStart;

  for (const row of relevantHistory) {
    const effectiveFrom = dateOnly(row.effective_from ?? row.changed_at ?? periodStart);
    if (effectiveFrom > periodStart && cursor <= dayBefore(effectiveFrom)) {
      const segmentEnd = minDate(dayBefore(effectiveFrom), periodEnd);
      segments.push({
        status: String(currentStatus),
        start_date: cursor,
        end_date: segmentEnd,
        eligible: isPayrollEligibleStatus(String(currentStatus)),
      });
      cursor = effectiveFrom;
    }
    currentStatus = row.new_status;
  }

  if (cursor <= periodEnd) {
    segments.push({
      status: String(currentStatus),
      start_date: cursor,
      end_date: periodEnd,
      eligible: isPayrollEligibleStatus(String(currentStatus)),
    });
  }

  const boundedSegments = segments
    .map((segment) => ({
      ...segment,
      start_date: maxDate(segment.start_date, periodStart),
      end_date: minDate(segment.end_date, periodEnd),
    }))
    .filter((segment) => segment.start_date <= segment.end_date);

  if (boundedSegments.some((segment) => segment.status === "suspended")) {
    warnings.push("Suspension payroll treatment depends on company payroll settings.");
  }

  const eligibleSegments = boundedSegments.filter((segment) => segment.eligible);
  const eligibleFrom = eligibleSegments.length ? eligibleSegments[0].start_date : null;
  const eligibleTo = eligibleSegments.length ? eligibleSegments[eligibleSegments.length - 1].end_date : null;
  const totalDays = countInclusiveDays(periodStart, periodEnd);
  const eligibleDays = eligibleSegments.reduce((sum, segment) => sum + countInclusiveDays(segment.start_date, segment.end_date), 0);

  return {
    eligible: eligibleSegments.length > 0,
    eligible_from: eligibleFrom,
    eligible_to: eligibleTo,
    excluded_days: Math.max(0, totalDays - eligibleDays),
    status_segments: boundedSegments,
    warnings,
  };
};

export const listSalaryHistory = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  await ensureEmployeeAccess(env, context, employeeId);
  return employeesRepository.listSalaryHistory(env, context.companyId, employeeId);
};

export const dayBefore = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
};

const prepareSalaryTimelineChange = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: SalaryHistoryInput,
) => {
  const id = createPrefixedId("salary_hist");
  const finalizedPayrollRun = await employeesRepository.findFinalizedPayrollRunByMonth(
    env,
    context.companyId,
    input.effective_from.slice(0, 7),
  );

  if (finalizedPayrollRun) {
    throw new AppError({
      code: "SALARY_CHANGE_FINALIZED_PERIOD_LOCKED",
      title: "Finalized payroll period",
      message: "Salary changes cannot affect a finalized payroll period.",
      statusCode: 423,
      retryable: false,
      fieldErrors: {
        effective_from: "Choose an effective date outside finalized payroll periods.",
      },
    });
  }

  const openSalaryRows = await employeesRepository.countOpenSalaryRows(
    env,
    context.companyId,
    employeeId,
  );

  if (openSalaryRows > 1) {
    throw new AppError({
      code: "SALARY_OVERLAP",
      title: "Salary timeline conflict",
      message: "This employee has overlapping active salary records. Please review the salary history before adding another change.",
      statusCode: 409,
      retryable: false,
    });
  }

  const futureSalary = await employeesRepository.findFutureSalary(
    env,
    context.companyId,
    employeeId,
    input.effective_from,
  );

  if (futureSalary) {
    throw new AppError({
      code: "SALARY_OVERLAP",
      title: "Salary timeline conflict",
      message: "A future salary change already exists for this employee. Please review the salary history before adding another change.",
      statusCode: 409,
      retryable: false,
      fieldErrors: {
        effective_from: "This effective date conflicts with an existing salary record.",
      },
    });
  }

  const currentSalary = await employeesRepository.findActiveSalaryAtOrBefore(
    env,
    context.companyId,
    employeeId,
    input.effective_from,
  );

  if (!currentSalary && !["starting_salary", "correction"].includes(input.change_type)) {
    throw new AppError({
      code: "EMPLOYEE_SALARY_MISSING",
      title: "Employee salary missing",
      message: "No salary record exists for this employee. Add a starting salary before recording an increment.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        change_type: "Use starting salary or correction when no previous salary record exists.",
      },
    });
  }

  if (
    currentSalary &&
    currentSalary.monthly_salary_amount === input.monthly_salary_amount &&
    input.change_type !== "correction"
  ) {
    throw new AppError({
      code: "INVALID_SALARY_AMOUNT",
      title: "Invalid salary amount",
      message: "The new salary amount should be different from the current salary.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        monthly_salary_amount: "New salary amount should be different from the current salary.",
      },
    });
  }

  return { id, currentSalary };
};

const applySalaryHistoryChange = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: SalaryHistoryInput,
  options: {
    expectedCurrentSalaryId?: string | null;
    approvalRequestId?: string;
  } = {},
) => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  if (options.approvalRequestId) {
    const existingApplied = await employeesRepository.findSalaryHistoryByApprovalRequestId(
      env,
      context.companyId,
      options.approvalRequestId,
    );
    if (existingApplied) {
      return {
        salary_record_id: String(existingApplied.id),
        closed_previous_salary_id: null,
        already_applied: true,
        salary: existingApplied,
      };
    }
  }
  const { id, currentSalary } = await prepareSalaryTimelineChange(env, context, employeeId, input);
  if (
    options.expectedCurrentSalaryId !== undefined &&
    (currentSalary?.id ?? null) !== options.expectedCurrentSalaryId
  ) {
    throw new AppError({
      code: "SALARY_TIMELINE_CHANGED",
      title: "Salary timeline changed",
      message: "This approval request is no longer current because the employee salary history changed.",
      statusCode: 409,
      retryable: false,
    });
  }

  try {
    await employeesRepository.createSalaryTimelineChange(env, {
      id,
      companyId: context.companyId,
      employeeId,
      salary: input,
      actorUserId: context.actorUserId,
      approvalRequestId: options.approvalRequestId,
      closePrevious: currentSalary
        ? {
            id: currentSalary.id,
            effectiveTo: dayBefore(input.effective_from),
          }
        : null,
    });
  } catch (error) {
    console.error("Employee salary history could not be saved", {
      employeeId,
      requestId: context.requestId,
      error,
    });
    throw new AppError({
      code: "SALARY_HISTORY_CREATE_FAILED",
      title: "Salary history could not be saved",
      message: "Salary history could not be saved. Please try again.",
      statusCode: 500,
      retryable: true,
    });
  }
  const oldSalaryAuditValue = currentSalary
    ? {
        monthly_salary_amount: currentSalary.monthly_salary_amount,
        currency: currentSalary.currency,
        effective_from: currentSalary.effective_from,
        effective_to: dayBefore(input.effective_from),
        change_type: currentSalary.change_type,
      }
    : null;
  const newSalaryAuditValue = {
    monthly_salary_amount: input.monthly_salary_amount,
    currency: input.currency ?? "MVR",
    effective_from: input.effective_from,
    effective_to: null,
    change_type: input.change_type,
  };

  await createAuditLog(env, {
    companyId: context.companyId,
    outletId: employee.primary_outlet_id ?? undefined,
    module: "employees",
    action: "employee_salary_changed",
    severity: "info",
    entityType: "employee_salary_history",
    entityId: id,
    employeeId,
    actorId: context.actorUserId,
    oldValueJson: JSON.stringify(oldSalaryAuditValue),
    newValueJson: JSON.stringify(newSalaryAuditValue),
    reason: input.reason,
    approvalRequestId: options.approvalRequestId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Employee salary audit log could not be recorded", {
      employeeId,
      requestId: context.requestId,
      error,
    });
  });

  return {
    salary_record_id: id,
    closed_previous_salary_id: currentSalary?.id ?? null,
    salary: await employeesRepository.findSalaryHistoryById(
      env,
      context.companyId,
      employeeId,
      id,
    ),
  };
};

export const addSalaryHistory = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: SalaryHistoryInput,
) => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  const { currentSalary } = await prepareSalaryTimelineChange(env, context, employeeId, input);
  const approval = await createSalaryApprovalIfRequired(env, context, employee, input, currentSalary);
  if (approval?.approval_required) return approval;

  try {
    const applied = await applySalaryHistoryChange(env, context, employeeId, input);
    if (isNoEligibleAutoApplyDecision(approval)) {
      await auditAutoApplyNoEligibleApprover(env, context, {
        employee,
        entityType: salaryApprovalType(input.change_type),
        action: "APPROVAL_AUTO_APPLIED_NO_ELIGIBLE_APPROVER",
        payload: {
          module: "salary",
          entity_type: salaryApprovalType(input.change_type),
          salary_record_id: applied.salary_record_id,
        },
        reason: input.reason,
      });
    }
    return applied;
  } catch (error) {
    if (isNoEligibleAutoApplyDecision(approval)) {
      await auditAutoApplyNoEligibleApprover(env, context, {
        employee,
        entityType: salaryApprovalType(input.change_type),
        action: "APPROVAL_AUTO_APPLY_FAILED",
        payload: {
          module: "salary",
          entity_type: salaryApprovalType(input.change_type),
          error: error instanceof Error ? error.message : "Salary change could not be applied.",
        },
        reason: input.reason,
      });
    }
    throw error;
  }
};

const deriveCompensationEffectiveStatus = (
  component: Pick<EmployeeCompensationComponentRecord, "status" | "effective_from" | "effective_to">,
  selectedDate = nowIso().slice(0, 10),
): CompensationEffectiveStatus => {
  if (component.status === "cancelled") return "cancelled";
  if (component.status === "pending_approval") return "pending_approval";
  if (component.effective_from > selectedDate) return "scheduled";
  if (component.effective_to && component.effective_to < selectedDate) return "ended";
  return "active";
};

const storedCompensationStatusForDate = (effectiveFrom: string, effectiveTo?: string | null) => {
  const today = nowIso().slice(0, 10);
  if (effectiveFrom > today) return "scheduled";
  if (effectiveTo && effectiveTo < today) return "ended";
  return "active";
};

const withEffectiveStatus = <T extends EmployeeCompensationComponentRecord>(
  component: T,
  selectedDate = nowIso().slice(0, 10),
) => ({
  ...component,
  effective_status: deriveCompensationEffectiveStatus(component, selectedDate),
});

const assertCompensationViewPermission = (context: AuthActor) => {
  if (!canViewCompensation(context)) {
    throw new PermissionError(
      "You do not have permission to view employee compensation.",
      "COMPENSATION_PERMISSION_DENIED",
    );
  }
};

const assertCompensationManagePermission = (context: AuthActor) => {
  if (!canManageCompensation(context)) {
    throw new PermissionError(
      "You do not have permission to manage employee compensation.",
      "COMPENSATION_PERMISSION_DENIED",
    );
  }
};

const assertCompensationPayrollMonthUnlocked = async (
  env: Env,
  companyId: string,
  date: string,
) => {
  const finalizedPayrollRun = await employeesRepository.findFinalizedPayrollRunByMonth(
    env,
    companyId,
    date.slice(0, 7),
  );

  if (finalizedPayrollRun) {
    throw new AppError({
      code: "COMPENSATION_FINALIZED_PERIOD_LOCKED",
      title: "Finalized payroll period",
      message: "Compensation changes cannot affect a finalized payroll period.",
      statusCode: 423,
      retryable: false,
      fieldErrors: {
        effective_from: "Choose an effective date outside finalized payroll periods.",
      },
    });
  }
};

const componentIdentity = (component: {
  component_definition_id?: string | null;
  component_type: string;
  component_code?: string | null;
  component_name: string;
}) => ({
  componentDefinitionId: component.component_definition_id ?? null,
  componentType: component.component_type,
  componentCode: component.component_code ?? null,
  componentName: component.component_name,
});

const normalizeCompensationComponent = async (
  env: Env,
  context: AuthActor,
  input: EmployeeCompensationComponentInput,
): Promise<EmployeeCompensationComponentInput> => {
  if (!input.component_definition_id) {
    return {
      ...input,
      currency: input.currency ?? "MVR",
      affects_gross_pay:
        input.calculation_type === "non_cash_benefit" ? false : input.affects_gross_pay,
      affects_net_pay:
        input.calculation_type === "non_cash_benefit" ? false : input.affects_net_pay,
    };
  }

  const definition = await employeesRepository.findCompensationComponentDefinition(
    env,
    context.companyId,
    input.component_definition_id,
  );

  if (!definition || definition.status !== "active") {
    throw new AppError({
      code: "INVALID_COMPENSATION_COMPONENT",
      title: "Compensation component unavailable",
      message: "Please choose an active compensation component.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        component_definition_id: "Please choose an active compensation component.",
      },
    });
  }

  return {
    ...input,
    component_type: definition.component_type as EmployeeCompensationComponentInput["component_type"],
    component_code: input.component_code ?? definition.component_code,
    component_name: input.component_name || definition.component_name,
    category: input.category ?? definition.category,
    currency: input.currency ?? definition.currency ?? "MVR",
    calculation_type: input.calculation_type ?? definition.calculation_type as EmployeeCompensationComponentInput["calculation_type"],
    affects_gross_pay:
      input.calculation_type === "non_cash_benefit" ? false : input.affects_gross_pay ?? Boolean(definition.affects_gross_pay),
    affects_net_pay:
      input.calculation_type === "non_cash_benefit" ? false : input.affects_net_pay ?? Boolean(definition.affects_net_pay),
  };
};

const getSalaryCurrencyForDate = async (
  env: Env,
  companyId: string,
  employeeId: string,
  effectiveDate: string,
) => {
  const salary = await employeesRepository.findActiveSalaryAtOrBefore(
    env,
    companyId,
    employeeId,
    effectiveDate,
  );
  return salary?.currency ?? "MVR";
};

const ensureCompensationCurrencyMatchesSalary = async (
  env: Env,
  companyId: string,
  employeeId: string,
  component: EmployeeCompensationComponentInput,
) => {
  const salaryCurrency = await getSalaryCurrencyForDate(
    env,
    companyId,
    employeeId,
    component.effective_from,
  );
  const componentCurrency = component.calculation_type === "percentage_of_basic_salary"
    ? salaryCurrency
    : (component.currency ?? salaryCurrency).toUpperCase();

  if (componentCurrency !== salaryCurrency) {
    throw new AppError({
      code: "COMPENSATION_CURRENCY_MISMATCH",
      title: "Compensation currency mismatch",
      message: "Compensation component currency must match the employee salary currency.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        currency: "Use the same currency as the employee salary until currency conversion is available.",
      },
    });
  }

  return {
    ...component,
    currency: salaryCurrency,
  };
};

const assertCompensationNoOverlap = async (
  env: Env,
  companyId: string,
  employeeId: string,
  component: EmployeeCompensationComponentInput,
  options: { effectiveTo?: string | null; excludeId?: string | null } = {},
) => {
  const overlap = await employeesRepository.findOverlappingCompensationComponent(
    env,
    companyId,
    employeeId,
    {
      ...componentIdentity(component),
      effectiveFrom: component.effective_from,
      effectiveTo: options.effectiveTo ?? null,
      excludeId: options.excludeId ?? null,
    },
  );

  if (overlap) {
    throw new AppError({
      code: overlap.status === "active" ? "COMPENSATION_COMPONENT_DUPLICATE" : "COMPENSATION_COMPONENT_OVERLAP",
      title: "Compensation component overlap",
      message: "This employee already has this compensation component for the selected dates.",
      statusCode: 409,
      retryable: false,
      fieldErrors: {
        effective_from: "This effective date overlaps an existing compensation component.",
      },
    });
  }
};

const auditCompensation = async (
  env: Env,
  context: AuthActor,
  input: {
    action: string;
    employee: EmployeeListRow;
    entityId: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
    approvalRequestId?: string | null;
  },
) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.employee.primary_outlet_id ?? undefined,
    module: "employees",
    action: input.action,
    severity: "info",
    entityType: "employee_compensation_component",
    entityId: input.entityId,
    employeeId: input.employee.id,
    actorId: context.actorUserId,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason,
    approvalRequestId: input.approvalRequestId ?? undefined,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Employee compensation audit log could not be recorded", {
      employeeId: input.employee.id,
      action: input.action,
      requestId: context.requestId,
      error,
    });
  });
};

const calculatedComponentAmount = (
  component: EmployeeCompensationComponentRecord,
  basicSalary: number,
) => {
  if (component.calculation_type === "percentage_of_basic_salary") {
    return Math.round((basicSalary * component.amount) / 100);
  }

  return component.amount;
};

const compensationStateChangedError = (approval = false) =>
  new AppError({
    code: approval ? "APPROVAL_REQUEST_STALE" : "COMPENSATION_STATE_CHANGED",
    title: approval ? "Approval request is stale" : "Compensation component changed",
    message: "This compensation component changed since the request was prepared. Please reload and try again.",
    statusCode: 409,
    retryable: false,
    details: {
      reason_code: "COMPENSATION_STATE_CHANGED",
    },
  });

const compensationNotActiveError = () =>
  new AppError({
    code: "COMPENSATION_COMPONENT_NOT_ACTIVE",
    title: "Compensation component is not active",
    message: "This compensation component is no longer active and cannot be changed.",
    statusCode: 409,
    retryable: false,
  });

const compensationOverlapRaceError = () =>
  new AppError({
    code: "COMPENSATION_COMPONENT_OVERLAP",
    title: "Compensation timeline conflict",
    message: "Another compensation component already overlaps this date range.",
    statusCode: 409,
    retryable: false,
  });

const isCompensationApprovalUniqueConflict = (error: unknown) =>
  error instanceof Error &&
  (
    error.message.toLowerCase().includes("idx_employee_comp_components_approval_request_unique") ||
    error.message.toLowerCase().includes("idx_compensation_approval_applications_request_unique") ||
    (
      error.message.toLowerCase().includes("unique") &&
      error.message.toLowerCase().includes("employee_compensation_components") &&
      error.message.toLowerCase().includes("approval_request_id")
    ) ||
    (
      error.message.toLowerCase().includes("unique") &&
      error.message.toLowerCase().includes("compensation_approval_applications") &&
      error.message.toLowerCase().includes("approval_request_id")
    )
  );

const compensationApprovalApplicationConflictError = () =>
  new AppError({
    code: "COMPENSATION_APPROVAL_APPLICATION_CONFLICT",
    title: "Compensation approval already applied",
    message: "This compensation approval has already been applied.",
    statusCode: 409,
    retryable: false,
  });

const compensationApprovalApplicationNotFoundError = () =>
  new AppError({
    code: "COMPENSATION_APPROVAL_APPLICATION_NOT_FOUND",
    title: "Compensation approval application not found",
    message: "The applied compensation approval record could not be found.",
    statusCode: 409,
    retryable: false,
  });

const compensationApprovalActionType = (
  action: CompensationApprovalPayload["approval_action"],
): CompensationApprovalApplicationAction => {
  if (action === "compensation_component_create") return "create";
  if (action === "compensation_component_change") return "change";
  return "end";
};

const recordCompensationApprovalApplication = async (
  env: Env,
  context: AuthActor,
  input: {
    approvalRequestId: string;
    employeeId: string;
    componentId: string;
    actionType: CompensationApprovalApplicationAction;
    appliedAt?: string;
  },
) => {
  const application = await employeesRepository.createCompensationApprovalApplication(env, {
    id: createPrefixedId("comp_app"),
    companyId: context.companyId,
    approvalRequestId: input.approvalRequestId,
    employeeId: input.employeeId,
    componentId: input.componentId,
    actionType: input.actionType,
    appliedAt: input.appliedAt ?? new Date().toISOString(),
  });

  if (!application) throw compensationApprovalApplicationNotFoundError();

  if (
    application.employee_id !== input.employeeId ||
    application.component_id !== input.componentId ||
    application.action_type !== input.actionType
  ) {
    throw compensationApprovalApplicationConflictError();
  }

  return application;
};

export const assertCompensationApprovalApplicationMatchesRequest = (input: {
  application: CompensationApprovalApplicationRecord;
  component: EmployeeCompensationComponentRecord;
  approvalRequestId: string;
  companyId: string;
  payload: CompensationApprovalPayload;
}) => {
  const expectedActionType = compensationApprovalActionType(input.payload.approval_action);
  const baseMatches =
    input.application.approval_request_id === input.approvalRequestId &&
    input.application.employee_id === input.payload.employee_id &&
    input.application.action_type === expectedActionType &&
    input.component.company_id === input.companyId &&
    input.component.employee_id === input.payload.employee_id &&
    input.component.id === input.application.component_id;

  if (!baseMatches) throw compensationApprovalApplicationConflictError();

  if (input.payload.approval_action === "compensation_component_create") {
    if (
      input.application.action_type !== "create" ||
      input.component.approval_request_id !== input.approvalRequestId
    ) {
      throw compensationApprovalApplicationConflictError();
    }
  }

  if (input.payload.approval_action === "compensation_component_change") {
    if (
      input.application.action_type !== "change" ||
      input.component.approval_request_id !== input.approvalRequestId ||
      input.component.id === input.payload.component_id
    ) {
      throw compensationApprovalApplicationConflictError();
    }
  }

  if (input.payload.approval_action === "compensation_component_end") {
    if (
      input.application.action_type !== "end" ||
      input.application.component_id !== input.payload.component_id
    ) {
      throw compensationApprovalApplicationConflictError();
    }
  }
};

const findAppliedCompensationApprovalTarget = async (
  env: Env,
  context: AuthActor,
  approvalRequestId: string,
  payload: CompensationApprovalPayload,
) => {
  const application = await employeesRepository.findCompensationApprovalApplication(
    env,
    context.companyId,
    approvalRequestId,
  );
  if (!application) return null;

  if (application.employee_id !== payload.employee_id) {
    throw compensationApprovalApplicationConflictError();
  }

  await ensureEmployeeAccess(env, context, payload.employee_id);
  const component = await employeesRepository.findCompensationComponentById(
    env,
    context.companyId,
    application.employee_id,
    application.component_id,
  );
  if (!component) throw compensationApprovalApplicationNotFoundError();

  assertCompensationApprovalApplicationMatchesRequest({
    application,
    component,
    approvalRequestId,
    companyId: context.companyId,
    payload,
  });

  return {
    component,
    approval_application: application,
    action_type: application.action_type,
    already_applied: true,
  };
};

const compensationExpectedState = (component: EmployeeCompensationComponentRecord) => ({
  id: component.id,
  status: component.status,
  effective_status: deriveCompensationEffectiveStatus(component),
  effective_from: component.effective_from,
  effective_to: component.effective_to ?? null,
  amount: component.amount,
  currency: component.currency,
  calculation_type: component.calculation_type,
  affects_gross_pay: Number(component.affects_gross_pay ?? 0),
  affects_net_pay: Number(component.affects_net_pay ?? 0),
  revision: Number(component.revision ?? 1),
  updated_at: component.updated_at,
});

const compensationRepositoryExpectedState = (component: EmployeeCompensationComponentRecord) => ({
  status: component.status,
  effectiveFrom: component.effective_from,
  effectiveTo: component.effective_to ?? null,
  amount: component.amount,
  currency: component.currency,
  calculationType: component.calculation_type,
  affectsGrossPay: Number(component.affects_gross_pay ?? 0),
  affectsNetPay: Number(component.affects_net_pay ?? 0),
  revision: Number(component.revision ?? 1),
  updatedAt: component.updated_at,
});

const assertCompensationComponentTransitionable = (
  component: EmployeeCompensationComponentRecord,
) => {
  const effectiveStatus = deriveCompensationEffectiveStatus(component);
  if (
    component.status === "cancelled" ||
    component.status === "pending_approval" ||
    component.status === "ended" ||
    effectiveStatus === "cancelled" ||
    effectiveStatus === "pending_approval" ||
    effectiveStatus === "ended"
  ) {
    throw compensationNotActiveError();
  }
};

const assertCompensationExpectedStateMatches = (
  current: EmployeeCompensationComponentRecord,
  expected: CompensationApprovalPayload["expected_current_component"] | EmployeeCompensationComponentRecord | null | undefined,
  approval = false,
) => {
  if (!expected) throw compensationStateChangedError(approval);

  const expectedState = "effective_status" in expected
    ? expected
    : compensationExpectedState(expected);
  const currentState = compensationExpectedState(current);
  const matches =
    currentState.id === expectedState.id &&
    currentState.status === expectedState.status &&
    currentState.effective_status === expectedState.effective_status &&
    currentState.effective_from === expectedState.effective_from &&
    currentState.effective_to === expectedState.effective_to &&
    currentState.amount === expectedState.amount &&
    currentState.currency === expectedState.currency &&
    currentState.calculation_type === expectedState.calculation_type &&
    currentState.affects_gross_pay === expectedState.affects_gross_pay &&
    currentState.affects_net_pay === expectedState.affects_net_pay &&
    currentState.revision === expectedState.revision &&
    currentState.updated_at === expectedState.updated_at;

  if (!matches) throw compensationStateChangedError(approval);
};

export const getActiveEmployeeCompensationComponents = async (
  env: Env,
  companyId: string,
  employeeId: string,
  payrollPeriodDate: string,
) =>
  employeesRepository.findActiveCompensationComponentsForDate(
    env,
    companyId,
    employeeId,
    payrollPeriodDate,
  );

const shouldRequireCompensationApproval = async (
  env: Env,
  companyId: string,
  componentType: string,
) => {
  const settings = await settingsService.getSalaryApprovalSettings(env, companyId);
  if (!settings.compensation_component_approval_enabled) return false;
  if (componentType === "allowance") return settings.compensation_allowance_approval_enabled !== false;
  if (componentType === "benefit") return settings.compensation_benefit_approval_enabled !== false;
  if (componentType === "deduction") return settings.compensation_deduction_approval_enabled !== false;
  return true;
};

const createCompensationApprovalIfRequired = async (
  env: Env,
  context: AuthActor,
  employee: EmployeeListRow,
  input: CompensationApprovalPayload,
  amount: number,
  currency: string,
) => {
  const componentType =
    input.proposed_component?.component_type ??
    input.current_component?.component_type ??
    "allowance";

  if (!(await shouldRequireCompensationApproval(env, context.companyId, componentType))) {
    return null;
  }

  const approval = await createApprovalRequestForWorkflow(env, context, {
    workflowKey: "salary_increment",
    module: "compensation",
    entityType: input.approval_action,
    entityId: input.component_id ?? employee.id,
    employeeId: employee.id,
    summary: `Compensation component change for ${employee.full_name}`,
    payload: input,
    amount,
    currency,
  });

  if (!approval?.approval_required || !approval.approval_request_id) {
    return isNoEligibleAutoApplyDecision(approval) ? approval : null;
  }

  await auditCompensation(env, context, {
    action: "COMPENSATION_COMPONENT_APPROVAL_REQUESTED",
    employee,
    entityId: input.component_id ?? approval.approval_request_id,
    newValue: {
      approval_request_id: approval.approval_request_id,
      approval_action: input.approval_action,
      component_type: componentType,
    },
    reason:
      input.proposed_component?.reason ??
      input.end_component?.reason ??
      "Compensation approval requested",
    approvalRequestId: approval.approval_request_id,
  });

  return {
    approval_required: true,
    approval_request_id: approval.approval_request_id,
    approval_request: approvalRequestResponse(
      approval.approval_request_id,
      input.approval_action,
      employee.id,
      input.proposed_component?.effective_from ?? input.end_component?.effective_to ?? nowIso().slice(0, 10),
    ),
    existing_approval_request:
      "existing" in approval && approval.existing === true,
  };
};

export const listCompensationComponents = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  assertCompensationViewPermission(context);
  await ensureEmployeeAccess(env, context, employeeId);
  return (await employeesRepository.listCompensationComponents(env, context.companyId, employeeId))
    .map((component) => withEffectiveStatus(component));
};

export const getCompensationSummary = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  assertCompensationViewPermission(context);
  await ensureEmployeeAccess(env, context, employeeId);

  const today = nowIso().slice(0, 10);
  const currentSalary = await employeesRepository.findActiveSalaryAtOrBefore(
    env,
    context.companyId,
    employeeId,
    today,
  );
  const basicSalary = currentSalary?.monthly_salary_amount ?? 0;
  const currency = currentSalary?.currency ?? "MVR";
  const activeComponents = await getActiveEmployeeCompensationComponents(
    env,
    context.companyId,
    employeeId,
    today,
  );

  let recurringCashAllowances = 0;
  let recurringCashBenefits = 0;
  let recurringCashDeductions = 0;
  let nonCashBenefits = 0;
  let recurringGrossAdditions = 0;
  let recurringGrossDeductions = 0;
  let recurringNetAdditions = 0;
  let recurringNetDeductions = 0;

  const components = activeComponents.map((component) => {
    const calculatedAmount = calculatedComponentAmount(component, basicSalary);
    const effectiveComponent = withEffectiveStatus(component, today);
    const isNonCashBenefit =
      effectiveComponent.component_type === "benefit" &&
      effectiveComponent.calculation_type === "non_cash_benefit";
    const cashPayrollComponent =
      !isNonCashBenefit &&
      (effectiveComponent.affects_gross_pay === 1 || effectiveComponent.affects_net_pay === 1);

    if (effectiveComponent.currency !== currency) {
      throw new AppError({
        code: "COMPENSATION_CURRENCY_MISMATCH",
        title: "Compensation currency mismatch",
        message: "Compensation summary cannot combine different currencies.",
        statusCode: 409,
        retryable: false,
      });
    }

    if (effectiveComponent.component_type === "allowance" && cashPayrollComponent) {
      recurringCashAllowances += calculatedAmount;
    }

    if (effectiveComponent.component_type === "benefit" && cashPayrollComponent) {
      recurringCashBenefits += calculatedAmount;
    }

    if (effectiveComponent.component_type === "deduction" && cashPayrollComponent) {
      recurringCashDeductions += calculatedAmount;
    }

    if (isNonCashBenefit) {
      nonCashBenefits += calculatedAmount;
    } else if (effectiveComponent.component_type === "deduction") {
      if (effectiveComponent.affects_gross_pay === 1) recurringGrossDeductions += calculatedAmount;
      if (effectiveComponent.affects_net_pay === 1) recurringNetDeductions += calculatedAmount;
    } else {
      if (effectiveComponent.affects_gross_pay === 1) recurringGrossAdditions += calculatedAmount;
      if (effectiveComponent.affects_net_pay === 1) recurringNetAdditions += calculatedAmount;
    }

    return {
      ...effectiveComponent,
      calculated_amount: calculatedAmount,
      cash_payroll_component: cashPayrollComponent,
    };
  });

  const estimatedRecurringGrossPay = basicSalary + recurringGrossAdditions - recurringGrossDeductions;
  const estimatedRecurringNet = basicSalary + recurringNetAdditions - recurringNetDeductions;

  return {
    employee_id: employeeId,
    currency,
    basic_salary: basicSalary,
    recurring_gross_additions: recurringGrossAdditions,
    recurring_gross_deductions: recurringGrossDeductions,
    recurring_net_additions: recurringNetAdditions,
    recurring_net_deductions: recurringNetDeductions,
    recurring_cash_allowances: recurringCashAllowances,
    recurring_cash_benefits: recurringCashBenefits,
    recurring_cash_deductions: recurringCashDeductions,
    non_cash_benefits: nonCashBenefits,
    estimated_recurring_gross_pay: estimatedRecurringGrossPay,
    estimated_recurring_net_before_variable_items: Math.max(estimatedRecurringNet, 0),
    components,
    note: "Estimated recurring compensation before variable payroll items.",
  };
};

const assertCompensationDefinitionManagePermission = (context: AuthActor) => {
  if (!canManageCompensationDefinitions(context)) {
    throw new PermissionError(
      "You do not have permission to manage compensation component definitions.",
      "COMPENSATION_PERMISSION_DENIED",
    );
  }
};

const assertUniqueDefinitionCode = async (
  env: Env,
  companyId: string,
  componentCode: string,
  excludeId?: string,
) => {
  const existing = await employeesRepository.findCompensationComponentDefinitionByCode(
    env,
    companyId,
    componentCode,
    excludeId,
  );

  if (existing) {
    throw new AppError({
      code: "COMPENSATION_COMPONENT_DUPLICATE",
      title: "Duplicate compensation component",
      message: "This compensation component code is already used.",
      statusCode: 409,
      retryable: false,
      fieldErrors: {
        component_code: "Use a unique component code.",
      },
    });
  }
};

export const listCompensationComponentDefinitions = async (
  env: Env,
  context: AuthActor,
  filters: CompensationComponentDefinitionFilters,
) => {
  if (!canViewCompensation(context) && !canManageCompensationDefinitions(context)) {
    throw new PermissionError(
      "You do not have permission to view compensation component definitions.",
      "COMPENSATION_PERMISSION_DENIED",
    );
  }

  const [total, rows] = await Promise.all([
    employeesRepository.countCompensationComponentDefinitions(env, context.companyId, filters),
    employeesRepository.listCompensationComponentDefinitions(env, context.companyId, filters),
  ]);

  return {
    rows,
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    },
  };
};

export const createCompensationComponentDefinition = async (
  env: Env,
  context: AuthActor,
  input: CompensationComponentDefinitionInput,
) => {
  assertCompensationDefinitionManagePermission(context);
  await assertUniqueDefinitionCode(env, context.companyId, input.component_code);
  const id = createPrefixedId("comp_def");
  await employeesRepository.createCompensationComponentDefinition(
    env,
    id,
    context.companyId,
    input,
    context.actorUserId,
  );
  await ensureAudit(env, context, {
    action: "COMPENSATION_COMPONENT_DEFINITION_CREATED",
    entityType: "compensation_component_definition",
    entityId: id,
    newValue: input,
    reason: input.reason,
  });
  return {
    definition: await employeesRepository.findCompensationComponentDefinition(env, context.companyId, id),
  };
};

export const updateCompensationComponentDefinition = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: CompensationComponentDefinitionInput,
) => {
  assertCompensationDefinitionManagePermission(context);
  const existing = await employeesRepository.findCompensationComponentDefinition(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Compensation component definition not found.");
  await assertUniqueDefinitionCode(env, context.companyId, input.component_code, id);
  await employeesRepository.updateCompensationComponentDefinition(
    env,
    context.companyId,
    id,
    input,
    context.actorUserId,
  );
  await ensureAudit(env, context, {
    action: "COMPENSATION_COMPONENT_DEFINITION_UPDATED",
    entityType: "compensation_component_definition",
    entityId: id,
    oldValue: existing,
    newValue: input,
    reason: input.reason,
  });
  return {
    definition: await employeesRepository.findCompensationComponentDefinition(env, context.companyId, id),
  };
};

export const setCompensationComponentDefinitionStatus = async (
  env: Env,
  context: AuthActor,
  id: string,
  status: "active" | "inactive",
  reason: string,
) => {
  assertCompensationDefinitionManagePermission(context);
  const existing = await employeesRepository.findCompensationComponentDefinition(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Compensation component definition not found.");
  await employeesRepository.setCompensationComponentDefinitionStatus(
    env,
    context.companyId,
    id,
    status,
    context.actorUserId,
  );
  await ensureAudit(env, context, {
    action: status === "active" ? "COMPENSATION_COMPONENT_DEFINITION_ENABLED" : "COMPENSATION_COMPONENT_DEFINITION_DISABLED",
    entityType: "compensation_component_definition",
    entityId: id,
    oldValue: existing,
    newValue: { status },
    reason,
  });
  return {
    definition: await employeesRepository.findCompensationComponentDefinition(env, context.companyId, id),
  };
};

export const createCompensationComponent = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: EmployeeCompensationComponentInput,
) => {
  assertCompensationManagePermission(context);
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  const component = await ensureCompensationCurrencyMatchesSalary(
    env,
    context.companyId,
    employeeId,
    await normalizeCompensationComponent(env, context, input),
  );
  await assertCompensationPayrollMonthUnlocked(env, context.companyId, component.effective_from);
  await assertCompensationNoOverlap(env, context.companyId, employeeId, component);

  const approval = await createCompensationApprovalIfRequired(env, context, employee, {
    approval_action: "compensation_component_create",
    employee_id: employeeId,
    proposed_component: component,
    requested_by: context.actorUserId,
  }, component.amount, component.currency ?? "MVR");
  if (approval?.approval_required) return approval;

  const id = createPrefixedId("comp");
  const status = storedCompensationStatusForDate(component.effective_from);
  const createResult = await employeesRepository.createCompensationComponent(env, {
    id,
    companyId: context.companyId,
    employeeId,
    component,
    status,
    actorUserId: context.actorUserId,
  });
  if ((createResult.meta?.changes ?? 0) !== 1) {
    throw compensationOverlapRaceError();
  }
  await auditCompensation(env, context, {
    action: "COMPENSATION_COMPONENT_CREATED",
    employee,
    entityId: id,
    newValue: { ...component, status },
    reason: component.reason,
  });

  return {
    component: await employeesRepository.findCompensationComponentById(
      env,
      context.companyId,
      employeeId,
      id,
    ),
  };
};

export const changeCompensationComponent = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  componentId: string,
  input: EmployeeCompensationComponentChangeInput,
) => {
  assertCompensationManagePermission(context);
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  const existing = await employeesRepository.findCompensationComponentById(
    env,
    context.companyId,
    employeeId,
    componentId,
  );

  if (!existing) {
    throw new NotFoundError("The requested compensation component could not be found.");
  }

  assertCompensationComponentTransitionable(existing);

  const component = await ensureCompensationCurrencyMatchesSalary(env, context.companyId, employeeId, await normalizeCompensationComponent(env, context, {
    component_definition_id: existing.component_definition_id,
    component_type: input.component_type ?? existing.component_type,
    component_code: input.component_code ?? existing.component_code,
    component_name: input.component_name ?? existing.component_name,
    category: input.category ?? existing.category,
    amount: input.amount ?? existing.amount,
    currency: input.currency ?? existing.currency,
    calculation_type: input.calculation_type ?? existing.calculation_type,
    affects_gross_pay:
      input.affects_gross_pay ?? Boolean(existing.affects_gross_pay),
    affects_net_pay:
      input.affects_net_pay ?? Boolean(existing.affects_net_pay),
    effective_from: input.effective_from,
    reason: input.reason,
    notes: input.notes ?? existing.notes,
  }));

  if (component.effective_from <= existing.effective_from) {
    throw new AppError({
      code: "COMPENSATION_COMPONENT_OVERLAP",
      title: "Compensation timeline conflict",
      message: "The new effective date must be after the existing component start date.",
      statusCode: 409,
      retryable: false,
      fieldErrors: {
        effective_from: "Choose a date after the existing component start date.",
      },
    });
  }

  const closePreviousEffectiveTo = dayBefore(component.effective_from);
  await assertCompensationPayrollMonthUnlocked(env, context.companyId, component.effective_from);
  await assertCompensationPayrollMonthUnlocked(env, context.companyId, closePreviousEffectiveTo);
  await assertCompensationNoOverlap(env, context.companyId, employeeId, component, {
    excludeId: existing.id,
  });

  const approval = await createCompensationApprovalIfRequired(env, context, employee, {
    approval_action: "compensation_component_change",
    employee_id: employeeId,
    component_id: componentId,
    current_component: existing,
    expected_current_component: compensationExpectedState(existing),
    proposed_component: component,
    requested_by: context.actorUserId,
  }, component.amount, component.currency ?? existing.currency ?? "MVR");
  if (approval?.approval_required) return approval;

  const newId = createPrefixedId("comp");
  const status = storedCompensationStatusForDate(component.effective_from);
  const transition = await employeesRepository.createCompensationComponentVersion(env, {
    previousId: existing.id,
    newId,
    companyId: context.companyId,
    employeeId,
    component,
    closePreviousEffectiveTo,
    previousStatus: storedCompensationStatusForDate(existing.effective_from, closePreviousEffectiveTo),
    status,
    actorUserId: context.actorUserId,
    expectedCurrent: compensationRepositoryExpectedState(existing),
  });
  if (!transition.changed) {
    throw compensationStateChangedError(false);
  }
  await auditCompensation(env, context, {
    action: "COMPENSATION_COMPONENT_CHANGED",
    employee,
    entityId: newId,
    oldValue: existing,
    newValue: { ...component, status, closed_previous_component_id: existing.id },
    reason: component.reason,
  });

  return {
    component: await employeesRepository.findCompensationComponentById(
      env,
      context.companyId,
      employeeId,
      newId,
    ),
    closed_previous_component_id: existing.id,
  };
};

export const endCompensationComponent = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  componentId: string,
  input: EmployeeCompensationComponentEndInput,
) => {
  assertCompensationManagePermission(context);
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  const existing = await employeesRepository.findCompensationComponentById(
    env,
    context.companyId,
    employeeId,
    componentId,
  );

  if (!existing) {
    throw new NotFoundError("The requested compensation component could not be found.");
  }
  assertCompensationComponentTransitionable(existing);

  if (input.effective_to < existing.effective_from) {
    throw new AppError({
      code: "COMPENSATION_COMPONENT_OVERLAP",
      title: "Compensation timeline conflict",
      message: "The end date cannot be before the component start date.",
      statusCode: 409,
      retryable: false,
      fieldErrors: {
        effective_to: "Choose an end date on or after the component start date.",
      },
    });
  }

  await assertCompensationPayrollMonthUnlocked(env, context.companyId, input.effective_to);
  const approval = await createCompensationApprovalIfRequired(env, context, employee, {
    approval_action: "compensation_component_end",
    employee_id: employeeId,
    component_id: componentId,
    current_component: existing,
    expected_current_component: compensationExpectedState(existing),
    end_component: input,
    requested_by: context.actorUserId,
  }, existing.amount, existing.currency ?? "MVR");
  if (approval?.approval_required) return approval;

  const result = await employeesRepository.endCompensationComponent(
    env,
    context.companyId,
    employeeId,
    componentId,
    input,
    context.actorUserId,
    storedCompensationStatusForDate(existing.effective_from, input.effective_to),
    null,
    compensationRepositoryExpectedState(existing),
  );
  if ((result.meta?.changes ?? 0) !== 1) {
    throw compensationStateChangedError(false);
  }
  await auditCompensation(env, context, {
    action: "COMPENSATION_COMPONENT_ENDED",
    employee,
    entityId: componentId,
    oldValue: existing,
    newValue: { effective_to: input.effective_to, status: "ended" },
    reason: input.reason,
  });

  return {
    component: await employeesRepository.findCompensationComponentById(
      env,
      context.companyId,
      employeeId,
      componentId,
    ),
  };
};

const parseApprovalPayload = <T>(value: unknown): T => {
  if (!value || typeof value !== "string") {
    throw new AppError("Approval request details could not be read.", "APPROVAL_REQUEST_STALE", 409);
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new AppError("Approval request details could not be read.", "APPROVAL_REQUEST_STALE", 409);
  }
};

const assertSalaryApprovalPayload = (payload: SalaryApprovalPayload): SalaryApprovalPayload => {
  if (
    payload.approval_action !== "salary_change" ||
    !payload.employee_id ||
    !payload.proposed_salary ||
    typeof payload.proposed_salary.monthly_salary_amount !== "number" ||
    !payload.proposed_salary.effective_from ||
    !payload.proposed_salary.change_type ||
    !payload.proposed_salary.reason
  ) {
    throw new AppError("Approval request details are incomplete.", "APPROVAL_REQUEST_STALE", 409);
  }
  return payload;
};

const assertJobSalaryApprovalPayload = (payload: JobSalaryApprovalPayload): JobSalaryApprovalPayload => {
  if (
    payload.approval_action !== "job_change_with_salary" ||
    !payload.employee_id ||
    !payload.job_change ||
    !payload.job_change.salary_change?.enabled ||
    !payload.expected_job
  ) {
    throw new AppError("Approval request details are incomplete.", "APPROVAL_REQUEST_STALE", 409);
  }
  return payload;
};

const assertCompensationApprovalPayload = (payload: CompensationApprovalPayload): CompensationApprovalPayload => {
  if (
    !payload.employee_id ||
    !payload.approval_action ||
    !["compensation_component_create", "compensation_component_change", "compensation_component_end"].includes(payload.approval_action)
  ) {
    throw new AppError("Approval request details are incomplete.", "APPROVAL_REQUEST_STALE", 409);
  }

  if (
    payload.approval_action === "compensation_component_create" &&
    !payload.proposed_component
  ) {
    throw new AppError("Approval request details are incomplete.", "APPROVAL_REQUEST_STALE", 409);
  }

  if (
    payload.approval_action === "compensation_component_change" &&
    (!payload.component_id || !payload.proposed_component)
  ) {
    throw new AppError("Approval request details are incomplete.", "APPROVAL_REQUEST_STALE", 409);
  }

  if (
    payload.approval_action === "compensation_component_end" &&
    (!payload.component_id || !payload.end_component)
  ) {
    throw new AppError("Approval request details are incomplete.", "APPROVAL_REQUEST_STALE", 409);
  }

  return payload;
};

export const applyApprovedSalaryApproval = async (
  env: Env,
  context: AuthActor,
  request: { id: string; payload_json?: string | null },
) => {
  const payload = assertSalaryApprovalPayload(parseApprovalPayload<SalaryApprovalPayload>(request.payload_json));
  const applied = await applySalaryHistoryChange(env, context, payload.employee_id, payload.proposed_salary, {
    expectedCurrentSalaryId: payload.current_salary_record_id,
    approvalRequestId: request.id,
  });
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "employees",
    action: "SALARY_CHANGE_APPLIED",
    severity: "info",
    entityType: "approval_request",
    entityId: request.id,
    employeeId: payload.employee_id,
    actorId: context.actorUserId,
    oldValueJson: JSON.stringify({
      salary_record_id: payload.current_salary_record_id,
      monthly_salary_amount: payload.old_monthly_salary_amount,
      currency: payload.old_currency,
    }),
    newValueJson: JSON.stringify({
      salary_record_id: applied.salary_record_id,
      monthly_salary_amount: payload.proposed_salary.monthly_salary_amount,
      currency: payload.proposed_salary.currency ?? "MVR",
      effective_from: payload.proposed_salary.effective_from,
      change_type: payload.proposed_salary.change_type,
    }),
    reason: payload.proposed_salary.reason,
    approvalRequestId: request.id,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Salary approval applied audit log could not be recorded", {
      approvalRequestId: request.id,
      employeeId: payload.employee_id,
      error,
    });
  });
  return applied;
};

export const findAppliedSalaryApproval = async (
  env: Env,
  context: AuthActor,
  request: { id: string; payload_json?: string | null },
) => {
  const payload = assertSalaryApprovalPayload(parseApprovalPayload<SalaryApprovalPayload>(request.payload_json));
  await ensureEmployeeAccess(env, context, payload.employee_id);
  const existing = await employeesRepository.findSalaryHistoryByApprovalRequestId(env, context.companyId, request.id);
  return existing ? {
    salary_record_id: String(existing.id),
    already_applied: true,
    salary: existing,
  } : null;
};

export const applyApprovedJobSalaryApproval = async (
  env: Env,
  context: AuthActor,
  request: { id: string; payload_json?: string | null },
) => {
  const payload = assertJobSalaryApprovalPayload(parseApprovalPayload<JobSalaryApprovalPayload>(request.payload_json));
  const existingJob = await employeesRepository.findJobHistoryByApprovalRequestId(env, context.companyId, request.id);
  if (existingJob) {
    const existingSalary = await employeesRepository.findSalaryHistoryByApprovalRequestId(env, context.companyId, request.id);
    return {
      employee: await getEmployee(env, context, payload.employee_id),
      job_change: existingJob,
      salary_change: existingSalary,
      already_applied: true,
    };
  }
  const applied = await applyJobChangeNow(env, context, payload.employee_id, payload.job_change, {
    skipPermissionCheck: true,
    approvalRequestId: request.id,
    expectedJob: payload.expected_job,
    expectedCurrentSalaryId: payload.current_salary_record_id,
  });
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "employees",
    action: "PROMOTION_APPLIED",
    severity: "info",
    entityType: "approval_request",
    entityId: request.id,
    employeeId: payload.employee_id,
    actorId: context.actorUserId,
    oldValueJson: JSON.stringify({
      ...payload.expected_job,
      salary_record_id: payload.current_salary_record_id,
      monthly_salary_amount: payload.old_monthly_salary_amount,
    }),
    newValueJson: JSON.stringify({
      job_change_id: applied.job_change?.id,
      salary_record_id: applied.salary_change?.id ?? null,
      salary_changed: Boolean(applied.salary_change),
    }),
    reason: payload.job_change.reason,
    approvalRequestId: request.id,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Promotion approval applied audit log could not be recorded", {
      approvalRequestId: request.id,
      employeeId: payload.employee_id,
      error,
    });
  });
  return applied;
};

export const findAppliedJobSalaryApproval = async (
  env: Env,
  context: AuthActor,
  request: { id: string; payload_json?: string | null },
) => {
  const payload = assertJobSalaryApprovalPayload(parseApprovalPayload<JobSalaryApprovalPayload>(request.payload_json));
  await ensureEmployeeAccess(env, context, payload.employee_id);
  const existingJob = await employeesRepository.findJobHistoryByApprovalRequestId(env, context.companyId, request.id);
  if (!existingJob) return null;
  const existingSalary = await employeesRepository.findSalaryHistoryByApprovalRequestId(env, context.companyId, request.id);
  return {
    job_change: existingJob,
    salary_change: existingSalary,
    already_applied: true,
  };
};

export const applyApprovedCompensationApproval = async (
  env: Env,
  context: AuthActor,
  request: { id: string; payload_json?: string | null },
) => {
  const payload = assertCompensationApprovalPayload(parseApprovalPayload<CompensationApprovalPayload>(request.payload_json));
  const employee = await ensureEmployeeAccess(env, context, payload.employee_id);
  const existingApplied = await findAppliedCompensationApprovalTarget(env, context, request.id, payload);
  if (existingApplied) {
    return existingApplied;
  }

  if (payload.approval_action === "compensation_component_create" && payload.proposed_component) {
    const actionType = compensationApprovalActionType(payload.approval_action);
    const component = await ensureCompensationCurrencyMatchesSalary(
      env,
      context.companyId,
      payload.employee_id,
      await normalizeCompensationComponent(env, context, payload.proposed_component),
    );
    await assertCompensationPayrollMonthUnlocked(env, context.companyId, component.effective_from);
    await assertCompensationNoOverlap(env, context.companyId, payload.employee_id, component);
    const id = createPrefixedId("comp");
    const status = storedCompensationStatusForDate(component.effective_from);
    let createResult;
    try {
      createResult = await employeesRepository.createApprovedCompensationComponent(env, {
        id,
        applicationId: createPrefixedId("comp_app"),
        companyId: context.companyId,
        employeeId: payload.employee_id,
        component,
        status,
        actorUserId: context.actorUserId,
        approvalRequestId: request.id,
        appliedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (!isCompensationApprovalUniqueConflict(error)) throw error;
      const applied = await findAppliedCompensationApprovalTarget(env, context, request.id, payload);
      if (applied) return applied;
      throw compensationApprovalApplicationConflictError();
    }
    if (!createResult.changed) {
      const applied = await findAppliedCompensationApprovalTarget(env, context, request.id, payload);
      if (applied) return applied;
      throw compensationOverlapRaceError();
    }
    const application = await employeesRepository.findCompensationApprovalApplication(
      env,
      context.companyId,
      request.id,
    );
    if (!application || application.component_id !== id || application.action_type !== actionType) {
      throw compensationApprovalApplicationConflictError();
    }
    const createdComponent = await employeesRepository.findCompensationComponentById(
        env,
        context.companyId,
      payload.employee_id,
      id,
    );
    if (!createdComponent) {
      throw compensationStateChangedError(true);
    }
    assertCompensationApprovalApplicationMatchesRequest({
      application,
      component: createdComponent,
      approvalRequestId: request.id,
      companyId: context.companyId,
      payload,
    });
    await auditCompensation(env, context, {
      action: "COMPENSATION_COMPONENT_APPLIED",
      employee,
      entityId: id,
      newValue: { ...component, status },
      reason: component.reason,
      approvalRequestId: request.id,
    });
    return {
      component: createdComponent,
      approval_application: application,
    };
  }

  if (payload.approval_action === "compensation_component_change" && payload.component_id && payload.proposed_component) {
    const actionType = compensationApprovalActionType(payload.approval_action);
    const current = await employeesRepository.findCompensationComponentById(
      env,
      context.companyId,
      payload.employee_id,
      payload.component_id,
    );
    if (!current) throw new NotFoundError("The requested compensation component could not be found.");
    assertCompensationComponentTransitionable(current);
    assertCompensationExpectedStateMatches(
      current,
      payload.expected_current_component ?? payload.current_component,
      true,
    );
    const component = await ensureCompensationCurrencyMatchesSalary(
      env,
      context.companyId,
      payload.employee_id,
      await normalizeCompensationComponent(env, context, {
        ...payload.proposed_component,
        component_definition_id: current.component_definition_id,
      }),
    );
    const closePreviousEffectiveTo = dayBefore(component.effective_from);
    await assertCompensationPayrollMonthUnlocked(env, context.companyId, component.effective_from);
    await assertCompensationPayrollMonthUnlocked(env, context.companyId, closePreviousEffectiveTo);
    await assertCompensationNoOverlap(env, context.companyId, payload.employee_id, component, {
      excludeId: current.id,
    });
    const newId = createPrefixedId("comp");
    let transition;
    try {
      transition = await employeesRepository.changeApprovedCompensationComponent(env, {
        previousId: current.id,
        newId,
        applicationId: createPrefixedId("comp_app"),
        companyId: context.companyId,
        employeeId: payload.employee_id,
        component,
        closePreviousEffectiveTo,
        previousStatus: storedCompensationStatusForDate(current.effective_from, closePreviousEffectiveTo),
        status: storedCompensationStatusForDate(component.effective_from),
        actorUserId: context.actorUserId,
        approvalRequestId: request.id,
        appliedAt: new Date().toISOString(),
        expectedCurrent: compensationRepositoryExpectedState(current),
      });
    } catch (error) {
      if (!isCompensationApprovalUniqueConflict(error)) throw error;
      const applied = await findAppliedCompensationApprovalTarget(env, context, request.id, payload);
      if (applied) return applied;
      throw compensationApprovalApplicationConflictError();
    }
    if (!transition.changed) {
      throw compensationStateChangedError(true);
    }
    const application = await employeesRepository.findCompensationApprovalApplication(
      env,
      context.companyId,
      request.id,
    );
    if (!application || application.component_id !== newId || application.action_type !== actionType) {
      throw compensationApprovalApplicationConflictError();
    }
    const replacementComponent = await employeesRepository.findCompensationComponentById(
      env,
      context.companyId,
      payload.employee_id,
      newId,
    );
    if (!replacementComponent) {
      throw compensationStateChangedError(true);
    }
    assertCompensationApprovalApplicationMatchesRequest({
      application,
      component: replacementComponent,
      approvalRequestId: request.id,
      companyId: context.companyId,
      payload,
    });
    await auditCompensation(env, context, {
      action: "COMPENSATION_COMPONENT_APPLIED",
      employee,
      entityId: newId,
      oldValue: current,
      newValue: component,
      reason: component.reason,
      approvalRequestId: request.id,
    });
    return {
      component: replacementComponent,
      closed_previous_component_id: current.id,
      approval_application: application,
    };
  }

  if (payload.approval_action === "compensation_component_end" && payload.component_id && payload.end_component) {
    const actionType = compensationApprovalActionType(payload.approval_action);
    const current = await employeesRepository.findCompensationComponentById(
      env,
      context.companyId,
      payload.employee_id,
      payload.component_id,
    );
    if (!current) throw new NotFoundError("The requested compensation component could not be found.");
    assertCompensationComponentTransitionable(current);
    assertCompensationExpectedStateMatches(
      current,
      payload.expected_current_component ?? payload.current_component,
      true,
    );
    await assertCompensationPayrollMonthUnlocked(env, context.companyId, payload.end_component.effective_to);
    let result;
    try {
      result = await employeesRepository.endApprovedCompensationComponent(env, {
        applicationId: createPrefixedId("comp_app"),
        companyId: context.companyId,
        employeeId: payload.employee_id,
        componentId: payload.component_id,
        component: payload.end_component,
        actorUserId: context.actorUserId,
        status: storedCompensationStatusForDate(current.effective_from, payload.end_component.effective_to),
        approvalRequestId: request.id,
        appliedAt: new Date().toISOString(),
        expectedCurrent: compensationRepositoryExpectedState(current),
      });
    } catch (error) {
      if (!isCompensationApprovalUniqueConflict(error)) throw error;
      const applied = await findAppliedCompensationApprovalTarget(env, context, request.id, payload);
      if (applied) return applied;
      throw compensationApprovalApplicationConflictError();
    }
    if (!result.changed) {
      throw compensationStateChangedError(true);
    }
    const application = await employeesRepository.findCompensationApprovalApplication(
      env,
      context.companyId,
      request.id,
    );
    if (!application || application.component_id !== payload.component_id || application.action_type !== actionType) {
      throw compensationApprovalApplicationConflictError();
    }
    const endedComponent = await employeesRepository.findCompensationComponentById(
      env,
      context.companyId,
      payload.employee_id,
      payload.component_id,
    );
    if (!endedComponent) {
      throw compensationStateChangedError(true);
    }
    assertCompensationApprovalApplicationMatchesRequest({
      application,
      component: endedComponent,
      approvalRequestId: request.id,
      companyId: context.companyId,
      payload,
    });
    await auditCompensation(env, context, {
      action: "COMPENSATION_COMPONENT_APPLIED",
      employee,
      entityId: payload.component_id,
      oldValue: current,
      newValue: payload.end_component,
      reason: payload.end_component.reason,
      approvalRequestId: request.id,
    });
    return {
      component: endedComponent,
      approval_application: application,
    };
  }

  throw new AppError("Approval request details are incomplete.", "APPROVAL_REQUEST_STALE", 409);
};

export const findAppliedCompensationApproval = async (
  env: Env,
  context: AuthActor,
  request: { id: string; payload_json?: string | null },
) => {
  const payload = assertCompensationApprovalPayload(parseApprovalPayload<CompensationApprovalPayload>(request.payload_json));
  const mapped = await findAppliedCompensationApprovalTarget(env, context, request.id, payload);
  if (mapped) return mapped;

  await ensureEmployeeAccess(env, context, payload.employee_id);
  const existing = await employeesRepository.findCompensationComponentByApprovalRequestId(env, context.companyId, request.id);
  if (!existing) return null;

  const actionType = compensationApprovalActionType(payload.approval_action);
  if (payload.approval_action === "compensation_component_end") {
    return null;
  }

  const application = await recordCompensationApprovalApplication(env, context, {
    approvalRequestId: request.id,
    employeeId: existing.employee_id,
    componentId: existing.id,
    actionType,
  });
  assertCompensationApprovalApplicationMatchesRequest({
    application,
    component: existing,
    approvalRequestId: request.id,
    companyId: context.companyId,
    payload,
  });

  return {
    component: existing,
    approval_application: application,
    already_applied: true,
  };
};

export const listDocuments = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  await ensureEmployeeAccess(env, context, employeeId);
  const includeSensitiveDocuments = permissionService.hasPermission(
    context,
    "documents.view_sensitive",
  );

  return employeesRepository.listDocuments(
    env,
    context.companyId,
    employeeId,
    includeSensitiveDocuments,
  ).then((documents) =>
    documents.map((document) =>
      sanitizeEmployeeDocument(document as Record<string, unknown>, includeSensitiveDocuments),
    ),
  );
};

export const addDocument = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: DocumentMetadataInput,
) => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);

  if (input.is_sensitive && !permissionService.hasPermission(context, "documents.view_sensitive")) {
    throw new PermissionError("You do not have permission to add sensitive documents.");
  }

  const id = createEntityId("doc");
  await employeesRepository.createDocument(
    env,
    id,
    context.companyId,
    employeeId,
    input,
    context.actorUserId,
  );
  await ensureAudit(env, context, {
    action: "employee_document_metadata_added",
    entityType: "employee_document",
    entityId: id,
    employeeId,
    outletId: employee.primary_outlet_id,
    newValue: { document_type: input.document_type, is_sensitive: input.is_sensitive },
  });

  return { document_id: id };
};

export const listNotes = async (env: Env, context: AuthActor, employeeId: string) => {
  await ensureEmployeeAccess(env, context, employeeId);
  return employeesRepository.listNotes(
    env,
    context.companyId,
    employeeId,
    hasSensitivePermission(context),
  );
};

export const addNote = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: EmployeeNoteInput,
) => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);

  if (input.is_sensitive && !hasSensitivePermission(context)) {
    throw new PermissionError("You do not have permission to add sensitive employee notes.");
  }

  const id = createPrefixedId("note");
  await employeesRepository.createNote(
    env,
    id,
    context.companyId,
    employeeId,
    input,
    context.actorUserId,
  );
  await ensureAudit(env, context, {
    action: "employee_note_added",
    entityType: "employee_note",
    entityId: id,
    employeeId,
    outletId: employee.primary_outlet_id,
    newValue: { note_type: input.note_type, is_sensitive: input.is_sensitive },
  });

  return { note_id: id };
};

export const listAuditLog = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  await ensureEmployeeAccess(env, context, employeeId);
  return employeesRepository.listEmployeeAuditLog(env, context.companyId, employeeId);
};
