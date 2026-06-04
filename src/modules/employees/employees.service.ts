import type {
  DocumentMetadataInput,
  EmployeeCreateInput,
  EmployeeListFilters,
  EmployeeListRow,
  EmployeePersistInput,
  EmployeeNoteInput,
  EmployeeRecord,
  EmployeeStatusInput,
  EmployeeUpdateInput,
  EmployeeWriteInput,
  JobChangeInput,
  OutletAssignmentInput,
  SalaryHistoryInput,
} from "./employees.types";
import * as employeesRepository from "./employees.repository";
import { createAuditLog } from "../../services/audit.service";
import { broadcastEvent } from "../../services/realtime.service";
import * as permissionService from "../../services/permission.service";
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

const nowIso = () => new Date().toISOString();

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
) => {
  const linkedUsers = await employeesRepository.findLinkedUsersByEmployeeId(
    env,
    context.companyId,
    employeeId,
  );

  for (const user of linkedUsers) {
    if (user.status !== "disabled") {
      await employeesRepository.disableLinkedUser(env, context.companyId, user.id);
    }

    await employeesRepository.revokeUserSessions(env, context.companyId, user.id);
    await auditUserLoginDisabled(env, context, {
      userId: user.id,
      employeeId,
      reason,
    });
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

export const changeStatus = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: EmployeeStatusInput,
) => {
  const existing = await ensureEmployeeAccess(env, context, employeeId);
  const merged = mergeEmployee(existing, {
    employment_status: input.new_status,
  });

  if (input.new_status === "resigned") {
    merged.resigned_at = input.effective_date ?? nowIso().slice(0, 10);
  }

  if (input.new_status === "terminated") {
    merged.terminated_at = input.effective_date ?? nowIso().slice(0, 10);
  }

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
    newStatus: input.new_status,
    reason: input.reason,
    changedBy: context.actorUserId,
  });
  if (input.new_status === "resigned" || input.new_status === "terminated") {
    await disableLinkedUserLogins(env, context, employeeId, input.reason);
  }
  await ensureAudit(env, context, {
    action: "employee_status_changed",
    entityType: "employee",
    entityId: employeeId,
    employeeId,
    outletId: existing.primary_outlet_id,
    oldValue: existing,
    newValue: merged,
    reason: input.reason,
  });
  await trackEmployeeSyncChange(env, context, {
    employeeId,
    outletId: existing.primary_outlet_id,
    actionType: "status_changed",
    payload: { employment_status: input.new_status },
  });

  return { updated: true };
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

export const changeJob = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: JobChangeInput,
) => {
  const existing = await ensureEmployeeAccess(env, context, employeeId);
  const merged = mergeEmployee(existing, {
    department_id: input.department_id,
    position_id: input.position_id,
  });

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
    outletId: existing.primary_outlet_id,
    departmentId: input.department_id,
    positionId: input.position_id,
    changeType: "job_change",
    effectiveFrom: input.effective_from,
    reason: input.reason,
    createdBy: context.actorUserId,
  });
  await ensureAudit(env, context, {
    action: "employee_job_changed",
    entityType: "employee",
    entityId: employeeId,
    employeeId,
    outletId: existing.primary_outlet_id,
    oldValue: {
      department_id: existing.department_id,
      position_id: existing.position_id,
    },
    newValue: {
      department_id: input.department_id,
      position_id: input.position_id,
    },
    reason: input.reason,
  });

  return { updated: true };
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

export const listSalaryHistory = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  await ensureEmployeeAccess(env, context, employeeId);
  return employeesRepository.listSalaryHistory(env, context.companyId, employeeId);
};

export const addSalaryHistory = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  input: SalaryHistoryInput,
) => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  const id = createPrefixedId("salary_hist");

  await employeesRepository.createSalaryHistory(
    env,
    id,
    context.companyId,
    employeeId,
    input,
    context.actorUserId,
  );
  await ensureAudit(env, context, {
    action: "employee_salary_added",
    entityType: "employee_salary_history",
    entityId: id,
    employeeId,
    outletId: employee.primary_outlet_id,
    newValue: input,
    reason: input.reason,
  });

  return { salary_record_id: id };
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
