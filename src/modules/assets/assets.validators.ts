import { ASSET_CONDITIONS, ASSET_DEDUCTION_STATUSES, ASSET_STATUSES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./assets.constants";
import type {
  AssetAssignInput,
  AssetCreateInput,
  AssetDeductionActionInput,
  AssetDeductionFilters,
  AssetDeductionRequestInput,
  AssetListFilters,
  AssetMarkInput,
  AssetReturnInput,
  AssetUpdateInput,
} from "./assets.types";
import { AppError, ValidationError } from "../../utils/errors";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const page = (value: unknown) => Math.max(1, Math.trunc(asNumber(value) ?? 1));
const pageSize = (value: unknown) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(value) ?? DEFAULT_PAGE_SIZE)));
const requireString = (value: unknown, message: string) => {
  const parsed = asString(value);
  if (!parsed) throw new ValidationError(message);
  return parsed;
};
const requireReason = (value: unknown) => {
  const reason = asString(value);
  if (!reason || reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return reason;
};
const integerMoney = (value: unknown, field = "Amount") => {
  const parsed = asNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${field} must be an integer amount in minor units.`);
  }
  return parsed;
};
const optionalIntegerMoney = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  return integerMoney(value, "Amount");
};
const optionalNullableMoney = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return integerMoney(value, "Amount");
};
const date = (value: unknown, message: string) => {
  const parsed = requireString(value, message);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || Number.isNaN(new Date(`${parsed}T00:00:00Z`).getTime())) {
    throw new ValidationError(message);
  }
  return parsed;
};
const payrollMonth = (value: unknown) => {
  const parsed = asString(value);
  if (!parsed) return undefined;
  if (!/^\d{4}-\d{2}$/.test(parsed)) throw new ValidationError("Please select a valid deduction month.");
  return parsed;
};

export const validateAssetFilters = (query: Record<string, unknown>): AssetListFilters => {
  const status = asString(query.status);
  if (status && !(ASSET_STATUSES as readonly string[]).includes(status)) throw new ValidationError("Please select a valid asset status.");
  const sortBy = asString(query.sort_by) ?? "created_at";
  return {
    search: asString(query.search),
    outlet_id: asString(query.outlet_id),
    employee_id: asString(query.employee_id),
    asset_type: asString(query.asset_type),
    status,
    current_condition: asString(query.current_condition),
    assigned_to: asString(query.assigned_to),
    date_from: asString(query.date_from),
    date_to: asString(query.date_to),
    page: page(query.page),
    page_size: pageSize(query.page_size),
    sort_by: ["asset_code", "asset_name", "status", "created_at", "updated_at"].includes(sortBy) ? sortBy : "created_at",
    sort_direction: asString(query.sort_direction)?.toLowerCase() === "asc" ? "asc" : "desc",
  };
};

export const validateAssetCreate = (payload: unknown): AssetCreateInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    asset_code: requireString(payload.asset_code, "Asset code is required."),
    asset_name: requireString(payload.asset_name, "Asset name is required."),
    asset_type: requireString(payload.asset_type, "Asset type is required."),
    outlet_id: asString(payload.outlet_id),
    purchase_value_amount: optionalIntegerMoney(payload.purchase_value_amount),
    current_condition: asString(payload.current_condition),
  };
};

export const validateAssetUpdate = (payload: unknown): AssetUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  if (payload.status !== undefined) {
    throw new AppError("Asset status changes must be made through the asset action buttons.", "ASSET_STATUS_CHANGE_REQUIRES_ACTION_ENDPOINT", 400);
  }
  return {
    asset_code: asString(payload.asset_code),
    asset_name: asString(payload.asset_name),
    asset_type: asString(payload.asset_type),
    outlet_id: payload.outlet_id === null ? null : asString(payload.outlet_id),
    purchase_value_amount: optionalNullableMoney(payload.purchase_value_amount),
    current_condition: payload.current_condition === null ? null : asString(payload.current_condition),
  };
};

export const validateAssetAssign = (payload: unknown): AssetAssignInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeId = asString(payload.employee_id);
  const outletId = asString(payload.outlet_id);
  if (!employeeId && !outletId) throw new ValidationError("Please select an employee or outlet for this asset.");
  if (employeeId && outletId) throw new ValidationError("Please assign this asset to either an employee or an outlet, not both.");
  return {
    employee_id: employeeId,
    outlet_id: outletId,
    issued_date: date(payload.issued_date, "Please select a valid issue date."),
    issue_condition: asString(payload.issue_condition),
    reason: requireReason(payload.reason),
  };
};

export const validateAssetReturn = (payload: unknown): AssetReturnInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    returned_date: date(payload.returned_date, "Please select a valid return date."),
    return_condition: asString(payload.return_condition),
    reason: requireReason(payload.reason),
  };
};

export const validateAssetMark = (payload: unknown): AssetMarkInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    reason: requireReason(payload.reason),
    deduction_amount: optionalIntegerMoney(payload.deduction_amount),
    deduction_month: payrollMonth(payload.deduction_month),
    request_deduction: payload.request_deduction === true,
  };
};

export const validateDeductionRequest = (payload: unknown): AssetDeductionRequestInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    amount: integerMoney(payload.amount, "Deduction amount"),
    deduction_month: payrollMonth(payload.deduction_month),
    reason: requireReason(payload.reason),
  };
};

export const validateDeductionAction = (payload: unknown): AssetDeductionActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: requireReason(payload.reason) };
};

export const validateDeductionFilters = (query: Record<string, unknown>): AssetDeductionFilters => {
  const status = asString(query.status);
  if (status && !(ASSET_DEDUCTION_STATUSES as readonly string[]).includes(status)) throw new ValidationError("Please select a valid deduction status.");
  return {
    status,
    employee_id: asString(query.employee_id),
    outlet_id: asString(query.outlet_id),
    page: page(query.page),
    page_size: pageSize(query.page_size),
  };
};
