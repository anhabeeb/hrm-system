import { APPROVAL_MODES, APPROVAL_STATUSES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./approvals.constants";
import type {
  ApprovalActionInput,
  ApprovalListFilters,
  ApprovalOverrideInput,
  StepInput,
  ThresholdFilters,
  ThresholdInput,
  WorkflowFilters,
  WorkflowInput,
  WorkflowUpdateInput,
} from "./approvals.types";
import { ValidationError } from "../../utils/errors";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const asBool = (value: unknown) => value === true || value === "true" ? true : value === false || value === "false" ? false : undefined;
const page = (value: unknown) => Math.max(1, Math.trunc(asNumber(value) ?? 1));
const pageSize = (value: unknown) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(value) ?? DEFAULT_PAGE_SIZE)));
const requireString = (value: unknown, message: string) => {
  const parsed = asString(value);
  if (!parsed) throw new ValidationError(message);
  return parsed;
};
const safeKey = (value: string, message: string) => {
  if (!/^[a-zA-Z0-9_.:-]+$/.test(value)) throw new ValidationError(message);
  return value;
};
const reason = (payload: Record<string, unknown>) => {
  const parsed = asString(payload.reason) ?? asString(payload.comment);
  if (!parsed || parsed.length < 3) throw new ValidationError("A reason is required for this action.");
  return parsed;
};
const optionalIntMoney = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = asNumber(value);
  if (!Number.isInteger(parsed) || parsed! < 0) throw new ValidationError("Amount must be an integer amount in minor units.");
  return parsed;
};

export const validateApprovalFilters = (query: Record<string, unknown>): ApprovalListFilters => {
  const status = asString(query.status);
  if (status && !(APPROVAL_STATUSES as readonly string[]).includes(status)) throw new ValidationError("Please select a valid approval status.");
  const sortBy = asString(query.sort_by) ?? "created_at";
  return {
    status,
    module: asString(query.module),
    workflow_id: asString(query.workflow_id),
    workflow_key: asString(query.workflow_key),
    entity_type: asString(query.entity_type),
    entity_id: asString(query.entity_id),
    employee_id: asString(query.employee_id),
    outlet_id: asString(query.outlet_id),
    requested_by: asString(query.requested_by),
    current_step: asNumber(query.current_step),
    date_from: asString(query.date_from),
    date_to: asString(query.date_to),
    assigned_to_me: asBool(query.assigned_to_me),
    page: page(query.page),
    page_size: pageSize(query.page_size),
    sort_by: ["created_at", "updated_at", "status", "module", "current_step"].includes(sortBy) ? sortBy : "created_at",
    sort_direction: asString(query.sort_direction)?.toLowerCase() === "asc" ? "asc" : "desc",
  };
};

export const validateApprovalAction = (payload: unknown): ApprovalActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: reason(payload), comment: asString(payload.comment) };
};

export const validateOverrideAction = (payload: unknown): ApprovalOverrideInput => {
  if (!isObject(payload)) throw new ValidationError();
  const decision = asString(payload.decision);
  if (decision !== "approve" && decision !== "reject") throw new ValidationError("Please select a valid override decision.");
  return { decision, reason: reason(payload), comment: asString(payload.comment) };
};

export const validateWorkflowFilters = (query: Record<string, unknown>): WorkflowFilters => ({
  module: asString(query.module),
  workflow_key: asString(query.workflow_key),
  is_enabled: asBool(query.is_enabled),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateWorkflowCreate = (payload: unknown): WorkflowInput => {
  if (!isObject(payload)) throw new ValidationError();
  const mode = asString(payload.approval_mode) ?? "manual";
  if (!(APPROVAL_MODES as readonly string[]).includes(mode)) throw new ValidationError("Please select a valid approval mode.");
  return {
    workflow_key: safeKey(requireString(payload.workflow_key, "Workflow key is required."), "Please enter a valid workflow key."),
    workflow_name: requireString(payload.workflow_name, "Workflow name is required."),
    module: safeKey(requireString(payload.module, "Module is required."), "Please enter a valid module key."),
    approval_mode: mode,
    reason: asString(payload.reason),
  };
};

export const validateWorkflowUpdate = (payload: unknown): WorkflowUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const mode = asString(payload.approval_mode);
  if (mode && !(APPROVAL_MODES as readonly string[]).includes(mode)) throw new ValidationError("Please select a valid approval mode.");
  return {
    workflow_key: payload.workflow_key === undefined ? undefined : safeKey(requireString(payload.workflow_key, "Workflow key is required."), "Please enter a valid workflow key."),
    workflow_name: asString(payload.workflow_name),
    module: payload.module === undefined ? undefined : safeKey(requireString(payload.module, "Module is required."), "Please enter a valid module key."),
    approval_mode: mode,
    is_enabled: asBool(payload.is_enabled),
    reason: asString(payload.reason),
  };
};

export const validateStepInput = (payload: unknown): StepInput => {
  if (!isObject(payload)) throw new ValidationError();
  const stepOrder = asNumber(payload.step_order);
  if (!Number.isInteger(stepOrder) || stepOrder! <= 0) throw new ValidationError("Step order must be a positive whole number.");
  const amountMin = optionalIntMoney(payload.amount_min);
  const amountMax = optionalIntMoney(payload.amount_max);
  if (amountMin !== undefined && amountMax !== undefined && amountMin > amountMax) throw new ValidationError("Minimum amount cannot be greater than maximum amount.");
  return {
    step_order: stepOrder!,
    step_name: requireString(payload.step_name, "Step name is required."),
    required_role_key: asString(payload.required_role_key) ?? null,
    required_permission_key: asString(payload.required_permission_key) ?? null,
    is_required: asBool(payload.is_required) ?? true,
    approval_type: asString(payload.approval_type) ?? "single",
    amount_min: amountMin ?? null,
    amount_max: amountMax ?? null,
    reason: asString(payload.reason),
  };
};

export const validateThresholdFilters = (query: Record<string, unknown>): ThresholdFilters => ({
  workflow_key: asString(query.workflow_key),
  threshold_type: asString(query.threshold_type),
  is_active: asBool(query.is_active),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateThresholdInput = (payload: unknown): ThresholdInput => {
  if (!isObject(payload)) throw new ValidationError();
  const amountMin = optionalIntMoney(payload.amount_min);
  const amountMax = optionalIntMoney(payload.amount_max);
  if (amountMin !== undefined && amountMax !== undefined && amountMin > amountMax) throw new ValidationError("Minimum amount cannot be greater than maximum amount.");
  const percentageMin = asNumber(payload.percentage_min);
  const percentageMax = asNumber(payload.percentage_max);
  if (percentageMin !== undefined && percentageMax !== undefined && percentageMin > percentageMax) throw new ValidationError("Minimum percentage cannot be greater than maximum percentage.");
  return {
    workflow_key: safeKey(requireString(payload.workflow_key, "Workflow key is required."), "Please enter a valid workflow key."),
    threshold_name: requireString(payload.threshold_name, "Threshold name is required."),
    threshold_type: safeKey(requireString(payload.threshold_type, "Threshold type is required."), "Please enter a valid threshold type."),
    amount_min: amountMin ?? null,
    amount_max: amountMax ?? null,
    percentage_min: percentageMin ?? null,
    percentage_max: percentageMax ?? null,
    currency: asString(payload.currency) ?? "MVR",
    required_roles_json: asString(payload.required_roles_json) ?? null,
    required_permissions_json: asString(payload.required_permissions_json) ?? null,
    effective_from: asString(payload.effective_from) ?? null,
    reason: reason(payload),
  };
};

export const validateThresholdUpdate = (payload: unknown): Partial<ThresholdInput> & { reason: string; is_active?: boolean } => {
  if (!isObject(payload)) throw new ValidationError();
  const amountMin = optionalIntMoney(payload.amount_min);
  const amountMax = optionalIntMoney(payload.amount_max);
  if (amountMin !== undefined && amountMax !== undefined && amountMin > amountMax) throw new ValidationError("Minimum amount cannot be greater than maximum amount.");
  const percentageMin = asNumber(payload.percentage_min);
  const percentageMax = asNumber(payload.percentage_max);
  if (percentageMin !== undefined && percentageMax !== undefined && percentageMin > percentageMax) throw new ValidationError("Minimum percentage cannot be greater than maximum percentage.");
  return {
    workflow_key: payload.workflow_key === undefined ? undefined : safeKey(requireString(payload.workflow_key, "Workflow key is required."), "Please enter a valid workflow key."),
    threshold_name: asString(payload.threshold_name),
    threshold_type: payload.threshold_type === undefined ? undefined : safeKey(requireString(payload.threshold_type, "Threshold type is required."), "Please enter a valid threshold type."),
    amount_min: amountMin,
    amount_max: amountMax,
    percentage_min: percentageMin,
    percentage_max: percentageMax,
    currency: asString(payload.currency),
    required_roles_json: payload.required_roles_json === undefined ? undefined : asString(payload.required_roles_json) ?? null,
    required_permissions_json: payload.required_permissions_json === undefined ? undefined : asString(payload.required_permissions_json) ?? null,
    effective_from: payload.effective_from === undefined ? undefined : asString(payload.effective_from) ?? null,
    is_active: asBool(payload.is_active),
    reason: reason(payload),
  };
};
