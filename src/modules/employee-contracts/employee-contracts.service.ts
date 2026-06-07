import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import { createAuditLog } from "../../services/audit.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, OutletAccessError, PermissionError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import {
  CONTRACT_TYPES_REQUIRING_END_DATE,
  DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS,
} from "./employee-contracts.constants";
import * as repository from "./employee-contracts.repository";
import type {
  ContractActionInput,
  ContractCreateInput,
  ContractEmployeeRecord,
  ContractListFilters,
  ContractRenewInput,
  ContractUpdateInput,
  EmployeeContractRecord,
} from "./employee-contracts.types";

interface ContractSettings {
  contract_tracking_enabled: boolean;
  contract_expiry_warning_days: number;
  contract_document_required: boolean;
  require_contract_for_foreign_employees: boolean;
  require_contract_for_all_employees: boolean;
  allow_multiple_active_contracts: boolean;
}

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const defaultSettings: ContractSettings = {
  contract_tracking_enabled: true,
  contract_expiry_warning_days: DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS,
  contract_document_required: false,
  require_contract_for_foreign_employees: false,
  require_contract_for_all_employees: false,
  allow_multiple_active_contracts: false,
};

const getContractSettings = async (env: Env, companyId: string): Promise<ContractSettings> => {
  const row = await settingsService.getSetting(env, companyId, "documents.contract_rules").catch(() => null);
  const parsed = parseJson<Partial<ContractSettings>>(row?.setting_value_json, {});
  const warningDays = Number(parsed.contract_expiry_warning_days);
  return {
    ...defaultSettings,
    ...parsed,
    contract_expiry_warning_days: Number.isInteger(warningDays) && warningDays > 0 ? warningDays : DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS,
  };
};

const hasContractPermission = (context: AuthActor, permission: string) =>
  context.isSuperAdmin ||
  permissionService.hasPermission(context, permission) ||
  permissionService.hasPermission(context, permission.replace("employees.contracts", "contracts")) ||
  permissionService.hasPermission(context, "employees.manage") ||
  permissionService.hasPermission(context, "employees.edit");

const assertView = (context: AuthActor) => {
  if (
    permissionService.hasPermission(context, "employees.view") ||
    hasContractPermission(context, "employees.contracts.view") ||
    hasContractPermission(context, "contracts.view")
  ) return;
  throw new PermissionError("You do not have permission to view employee contracts.", "CONTRACT_PERMISSION_DENIED");
};

const assertManage = (context: AuthActor) => {
  if (hasContractPermission(context, "employees.contracts.manage") || hasContractPermission(context, "contracts.manage")) return;
  throw new PermissionError("You do not have permission to manage employee contracts.", "CONTRACT_PERMISSION_DENIED");
};

const assertEmployeeAccess = async (env: Env, context: AuthActor, employeeId: string): Promise<ContractEmployeeRecord> => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee || employee.deleted_at) {
    throw new NotFoundError("The requested employee could not be found.");
  }
  if (!context.isSuperAdmin && !permissionService.hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }
  return employee;
};

const pagination = (filters: ContractListFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.max(1, Math.ceil(total / filters.page_size)),
});

const requiresEndDate = (contractType: string) =>
  (CONTRACT_TYPES_REQUIRING_END_DATE as readonly string[]).includes(contractType);

const requireEndDateIfNeeded = (payload: Pick<ContractCreateInput, "contract_type" | "end_date">) => {
  if (requiresEndDate(payload.contract_type) && !payload.end_date) {
    throw new AppError({
      code: "CONTRACT_END_DATE_REQUIRED",
      message: "Contract end date is required for this contract type.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { end_date: "Contract end date is required for this contract type." },
    });
  }
};

const assertDateRange = (startDate: string, endDate?: string | null) => {
  if (endDate && endDate <= startDate) {
    throw new AppError({
      code: "CONTRACT_DATE_RANGE_INVALID",
      message: "Contract end date must be after start date.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { end_date: "Contract end date must be after start date." },
    });
  }
};

const assertSignedDate = (startDate: string, signedDate?: string | null) => {
  if (signedDate && signedDate > startDate) {
    throw new AppError({
      code: "CONTRACT_DATE_RANGE_INVALID",
      message: "Contract signed date cannot be after the start date.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { signed_date: "Contract signed date cannot be after the start date." },
    });
  }
};

const assertDocumentBelongsToEmployee = async (
  env: Env,
  companyId: string,
  employeeId: string,
  documentId?: string | null,
) => {
  if (!documentId) return;
  const document = await repository.findDocumentForEmployee(env, companyId, employeeId, documentId);
  if (!document) {
    throw new AppError({
      code: "CONTRACT_DOCUMENT_INVALID",
      message: "Contract document must belong to this employee.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { document_id: "Choose a document uploaded for this employee." },
    });
  }
};

const assertContractNumberUnique = async (
  env: Env,
  companyId: string,
  contractNumber?: string | null,
  excludeId?: string,
) => {
  if (!contractNumber) return;
  const duplicate = await repository.findDuplicateContractNumber(env, companyId, contractNumber, excludeId);
  if (duplicate) {
    throw new AppError({
      code: "DUPLICATE_CONTRACT_NUMBER",
      message: "A contract with this contract number already exists.",
      statusCode: 409,
      retryable: false,
      fieldErrors: { contract_number: "Contract number must be unique." },
    });
  }
};

const assertNoOverlap = async (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string | null | undefined,
  allowMultiple: boolean,
  excludeId?: string,
) => {
  if (allowMultiple) return;
  const overlap = await repository.findOverlappingContract(env, companyId, employeeId, startDate, endDate ?? null, excludeId);
  if (overlap) {
    throw new AppError({
      code: "CONTRACT_OVERLAP",
      message: "This employee already has an active contract overlapping this date range.",
      statusCode: 409,
      retryable: false,
    });
  }
};

const audit = async (
  env: Env,
  context: AuthActor,
  input: {
    action: string;
    employeeId: string;
    contractId?: string;
    reason?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
  },
) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "employee_contracts",
    action: input.action,
    severity: input.action.includes("ARCHIVED") ? "warning" : "info",
    entityType: "employee_contract",
    entityId: input.contractId,
    employeeId: input.employeeId,
    actorId: context.actorUserId,
    reason: input.reason ?? undefined,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.error("Employee contract audit log could not be recorded", {
      action: input.action,
      contractId: input.contractId,
      requestId: context.requestId,
      error,
    });
  });
};

export const listEmployeeContracts = async (env: Env, context: AuthActor, employeeId: string) => {
  assertView(context);
  await assertEmployeeAccess(env, context, employeeId);
  const settings = await getContractSettings(env, context.companyId);
  const contracts = await repository.listContractsForEmployee(env, context.companyId, employeeId, settings.contract_expiry_warning_days);
  const activeContract = contracts.find((contract) => ["active", "expiring_soon"].includes(contract.contract_status)) ?? null;
  const latestExpiredContract = contracts.find((contract) => contract.contract_status === "expired") ?? null;
  const current_contract = activeContract ?? latestExpiredContract ?? null;
  const warnings = [
    contracts.length === 0 ? "No contract is recorded for this employee." : null,
    !activeContract && latestExpiredContract ? `No active contract. Latest contract expired on ${latestExpiredContract.end_date}.` : null,
    activeContract?.contract_status === "expiring_soon" && activeContract.days_until_expiry !== null && activeContract.days_until_expiry !== undefined
      ? `Contract expires in ${activeContract.days_until_expiry} day${activeContract.days_until_expiry === 1 ? "" : "s"}.`
      : null,
    settings.contract_document_required && activeContract && !activeContract.document_id ? "Contract document is missing." : null,
  ].filter(Boolean);
  return { contracts, current_contract, warnings, settings };
};

export const listContracts = async (env: Env, context: AuthActor, filters: ContractListFilters) => {
  assertView(context);
  if (filters.outlet_id && !permissionService.hasOutletAccess(context, filters.outlet_id)) {
    throw new OutletAccessError("You do not have access to this outlet.");
  }
  const settings = await getContractSettings(env, context.companyId);
  const [rows, total] = await Promise.all([
    repository.listContracts(env, context.companyId, filters, context.outletIds, context.isSuperAdmin, settings.contract_expiry_warning_days),
    repository.countContracts(env, context.companyId, filters, context.outletIds, context.isSuperAdmin, settings.contract_expiry_warning_days),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const getContract = async (env: Env, context: AuthActor, employeeId: string, contractId: string) => {
  assertView(context);
  await assertEmployeeAccess(env, context, employeeId);
  const settings = await getContractSettings(env, context.companyId);
  const contract = await repository.findContractById(env, context.companyId, employeeId, contractId, settings.contract_expiry_warning_days);
  if (!contract) throw new NotFoundError("The requested employee contract could not be found.");
  return { contract };
};

const normalizeCreatePayload = (employee: ContractEmployeeRecord, payload: ContractCreateInput, actorUserId: string, versionNumber = 1, renewalOfContractId?: string | null) => ({
  ...payload,
  contract_status: payload.contract_status ?? "active",
  version_number: versionNumber,
  renewal_of_contract_id: renewalOfContractId ?? null,
  created_by: actorUserId,
  position_id: payload.position_id ?? employee.position_id,
  department_id: payload.department_id ?? employee.department_id,
  outlet_id: payload.outlet_id ?? employee.primary_outlet_id,
});

export const createContract = async (env: Env, context: AuthActor, employeeId: string, input: ContractCreateInput) => {
  assertManage(context);
  const employee = await assertEmployeeAccess(env, context, employeeId);
  const settings = await getContractSettings(env, context.companyId);
  if (!settings.contract_tracking_enabled) {
    throw new AppError({ code: "FEATURE_DISABLED", message: "Contract tracking is currently disabled.", statusCode: 403, retryable: false });
  }
  requireEndDateIfNeeded(input);
  assertDateRange(input.start_date, input.end_date);
  assertSignedDate(input.start_date, input.signed_date);
  await assertDocumentBelongsToEmployee(env, context.companyId, employeeId, input.document_id);
  await assertContractNumberUnique(env, context.companyId, input.contract_number);
  await assertNoOverlap(env, context.companyId, employeeId, input.start_date, input.end_date, settings.allow_multiple_active_contracts);
  const id = createPrefixedId("contract");
  const payload = normalizeCreatePayload(employee, input, context.actorUserId);
  await repository.createContract(env, { id, companyId: context.companyId, employeeId, payload });
  const result = await repository.findContractById(env, context.companyId, employeeId, id, settings.contract_expiry_warning_days);
  await audit(env, context, { action: "EMPLOYEE_CONTRACT_CREATED", employeeId, contractId: id, reason: input.reason, newValue: result });
  if (input.document_id) {
    await audit(env, context, { action: "EMPLOYEE_CONTRACT_DOCUMENT_LINKED", employeeId, contractId: id, reason: input.reason, newValue: { document_id: input.document_id } });
  }
  return { contract: result };
};

export const updateContract = async (env: Env, context: AuthActor, employeeId: string, contractId: string, input: ContractUpdateInput) => {
  assertManage(context);
  const employee = await assertEmployeeAccess(env, context, employeeId);
  const settings = await getContractSettings(env, context.companyId);
  const existing = await repository.findContractById(env, context.companyId, employeeId, contractId, settings.contract_expiry_warning_days);
  if (!existing) throw new NotFoundError("The requested employee contract could not be found.");
  const nextType = input.contract_type ?? existing.contract_type;
  const nextStart = input.start_date ?? existing.start_date;
  const nextEnd = input.end_date !== undefined ? input.end_date : existing.end_date;
  const nextSignedDate = input.signed_date !== undefined ? input.signed_date : existing.signed_date;
  requireEndDateIfNeeded({ contract_type: nextType, end_date: nextEnd });
  assertDateRange(nextStart, nextEnd);
  assertSignedDate(nextStart, nextSignedDate);
  await assertDocumentBelongsToEmployee(env, context.companyId, employeeId, input.document_id);
  await assertContractNumberUnique(env, context.companyId, input.contract_number, contractId);
  await assertNoOverlap(env, context.companyId, employeeId, nextStart, nextEnd, settings.allow_multiple_active_contracts, contractId);
  const payload = {
    ...input,
    position_id: input.position_id ?? employee.position_id,
    department_id: input.department_id ?? employee.department_id,
    outlet_id: input.outlet_id ?? employee.primary_outlet_id,
  };
  await repository.updateContract(env, context.companyId, contractId, payload, context.actorUserId);
  const updated = await repository.findContractById(env, context.companyId, employeeId, contractId, settings.contract_expiry_warning_days);
  await audit(env, context, { action: "EMPLOYEE_CONTRACT_UPDATED", employeeId, contractId, reason: input.reason, oldValue: existing, newValue: updated });
  if (input.document_id && input.document_id !== existing.document_id) {
    await audit(env, context, { action: "EMPLOYEE_CONTRACT_DOCUMENT_LINKED", employeeId, contractId, reason: input.reason, newValue: { document_id: input.document_id } });
  }
  return { contract: updated };
};

export const renewContract = async (env: Env, context: AuthActor, employeeId: string, contractId: string, input: ContractRenewInput) => {
  assertManage(context);
  const employee = await assertEmployeeAccess(env, context, employeeId);
  const settings = await getContractSettings(env, context.companyId);
  const existing = await repository.findContractById(env, context.companyId, employeeId, contractId, settings.contract_expiry_warning_days);
  if (!existing) throw new NotFoundError("The requested employee contract could not be found.");
  if (["archived", "cancelled"].includes(existing.contract_status)) {
    throw new AppError({ code: "CONTRACT_CANNOT_RENEW", message: "Archived or cancelled contracts cannot be renewed.", statusCode: 409, retryable: false });
  }
  const payload: ContractCreateInput = {
    contract_number: input.new_contract_number ?? null,
    contract_type: existing.contract_type,
    contract_status: "active",
    start_date: input.start_date,
    end_date: input.end_date ?? null,
    signed_date: input.signed_date ?? null,
    probation_end_date: input.probation_end_date ?? null,
    document_id: input.document_id ?? null,
    salary_snapshot_amount: existing.salary_snapshot_amount,
    currency: existing.currency,
    position_id: existing.position_id ?? employee.position_id,
    department_id: existing.department_id ?? employee.department_id,
    outlet_id: existing.outlet_id ?? employee.primary_outlet_id,
    notes: input.notes ?? null,
    reason: input.reason,
  };
  requireEndDateIfNeeded(payload);
  assertDateRange(payload.start_date, payload.end_date);
  assertSignedDate(payload.start_date, payload.signed_date);
  await assertDocumentBelongsToEmployee(env, context.companyId, employeeId, payload.document_id);
  await assertContractNumberUnique(env, context.companyId, payload.contract_number);
  await assertNoOverlap(env, context.companyId, employeeId, payload.start_date, payload.end_date, settings.allow_multiple_active_contracts, contractId);
  const newContractId = createPrefixedId("contract");
  await repository.markRenewedAndCreate(env, {
    oldContractId: contractId,
    newContractId,
    companyId: context.companyId,
    employeeId,
    actorUserId: context.actorUserId,
    payload: {
      ...payload,
      contract_status: "active",
      version_number: Number(existing.version_number ?? 1) + 1,
      renewal_of_contract_id: contractId,
    },
  });
  const renewed = await repository.findContractById(env, context.companyId, employeeId, newContractId, settings.contract_expiry_warning_days);
  await audit(env, context, { action: "EMPLOYEE_CONTRACT_RENEWED", employeeId, contractId: newContractId, reason: input.reason, oldValue: existing, newValue: renewed });
  return { contract: renewed };
};

export const archiveContract = async (env: Env, context: AuthActor, employeeId: string, contractId: string, input: ContractActionInput) => {
  assertManage(context);
  await assertEmployeeAccess(env, context, employeeId);
  const settings = await getContractSettings(env, context.companyId);
  const existing = await repository.findContractById(env, context.companyId, employeeId, contractId, settings.contract_expiry_warning_days);
  if (!existing) throw new NotFoundError("The requested employee contract could not be found.");
  await repository.archiveContract(env, context.companyId, contractId, context.actorUserId, input.reason, input.notes);
  const archived = await repository.findContractById(env, context.companyId, employeeId, contractId, settings.contract_expiry_warning_days);
  await audit(env, context, { action: "EMPLOYEE_CONTRACT_ARCHIVED", employeeId, contractId, reason: input.reason, oldValue: existing, newValue: archived });
  return { contract: archived };
};

export const getContractHistory = async (env: Env, context: AuthActor, employeeId: string, contractId: string) => {
  assertView(context);
  await assertEmployeeAccess(env, context, employeeId);
  const contract = await repository.findContractById(env, context.companyId, employeeId, contractId);
  if (!contract) throw new NotFoundError("The requested employee contract could not be found.");
  const history = await repository.listContractHistory(env, context.companyId, employeeId, contractId);
  return { contract, history };
};

export const getExpiringContracts = repository.getExpiringContracts;
export const getExpiredContracts = repository.getExpiredContracts;
