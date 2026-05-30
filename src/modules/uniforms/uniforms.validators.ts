import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, UNIFORM_STATUSES } from "./uniforms.constants";
import type { UniformFilters, UniformIssueInput, UniformReturnInput } from "./uniforms.types";
import { ValidationError } from "../../utils/errors";

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
const date = (value: unknown, message: string) => {
  const parsed = requireString(value, message);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || Number.isNaN(new Date(`${parsed}T00:00:00Z`).getTime())) throw new ValidationError(message);
  return parsed;
};
const requireReason = (value: unknown) => {
  const reason = asString(value);
  if (!reason || reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return reason;
};

export const validateUniformFilters = (query: Record<string, unknown>): UniformFilters => {
  const status = asString(query.status);
  if (status && !(UNIFORM_STATUSES as readonly string[]).includes(status)) throw new ValidationError("Please select a valid uniform status.");
  return {
    employee_id: asString(query.employee_id),
    outlet_id: asString(query.outlet_id),
    uniform_type: asString(query.uniform_type),
    status,
    date_from: asString(query.date_from),
    date_to: asString(query.date_to),
    page: page(query.page),
    page_size: pageSize(query.page_size),
  };
};

export const validateUniformIssue = (payload: unknown): UniformIssueInput => {
  if (!isObject(payload)) throw new ValidationError();
  const quantity = asNumber(payload.quantity);
  if (!Number.isInteger(quantity) || quantity! <= 0) throw new ValidationError("Uniform quantity must be a positive whole number.");
  return {
    employee_id: requireString(payload.employee_id, "Employee is required."),
    outlet_id: asString(payload.outlet_id),
    uniform_type: requireString(payload.uniform_type, "Uniform type is required."),
    quantity: quantity!,
    issued_date: date(payload.issued_date, "Please select a valid issue date."),
    reason: asString(payload.reason),
  };
};

export const validateUniformReturn = (payload: unknown): UniformReturnInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    returned_date: date(payload.returned_date, "Please select a valid return date."),
    reason: requireReason(payload.reason),
  };
};
