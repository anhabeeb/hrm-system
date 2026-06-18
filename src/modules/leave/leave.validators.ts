import {
  LEAVE_POLICY_STATUSES,
  LEAVE_REQUEST_STATUSES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./leave.constants";
import type {
  LeaveActionInput,
  LeaveAccrualInput,
  LeaveBalanceAdjustInput,
  LeaveBalanceFilters,
  LeaveBalanceTransactionFilters,
  LeaveCarryForwardInput,
  LeaveCalendarFilters,
  LeaveDelegateInput,
  LeaveExpiryInput,
  LeaveOpeningBalanceInput,
  LeavePolicyFilters,
  LeavePolicyInput,
  LeavePolicyUpdateInput,
  LeavePolicyPreviewInput,
  LeaveRequestFilters,
  LeaveRequestInput,
  LeaveRequestUpdateInput,
  LeaveTypeFilters,
  LeaveTypePolicyRuleUpdateInput,
  LeaveTypeUpdateInput,
} from "./leave.types";
import { ValidationError } from "../../utils/errors";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const asOptionalString = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return asString(value);
};

const asNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const asBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return undefined;
};

const page = (value: unknown) => Math.max(1, Math.trunc(asNumber(value) ?? 1));
const pageSize = (value: unknown) =>
  Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(value) ?? DEFAULT_PAGE_SIZE)));

export const isValidDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

const requireDate = (value: unknown, message = "Please choose a valid date."): string => {
  const date = asString(value);
  if (!date || !isValidDate(date)) throw new ValidationError(message);
  return date;
};

export const validateDateRange = (startDate: string, endDate: string) => {
  if (startDate > endDate) {
    throw new ValidationError("Start date must be before or equal to end date.");
  }
};

const requireReason = (value: unknown): string => {
  const reason = asString(value);
  if (!reason || reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return reason;
};

export const validateLeaveTypeFilters = (query: Record<string, unknown>): LeaveTypeFilters => ({
  is_enabled: asString(query.is_enabled),
  is_statutory: asString(query.is_statutory),
  is_paid: asString(query.is_paid),
  search: asString(query.search),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateLeaveTypeUpdate = (payload: unknown): LeaveTypeUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const defaultDays = asNumber(payload.default_days);
  if (defaultDays !== undefined && (!Number.isInteger(defaultDays) || defaultDays < 0)) {
    throw new ValidationError("Please enter a valid number of leave days.");
  }
  const frequency = asString(payload.accrual_frequency);
  if (frequency && !["none", "monthly", "yearly", "daily", "custom"].includes(frequency)) {
    throw new ValidationError("Please select a valid accrual frequency.");
  }
  const maxNegativeBalance = asNumber(payload.max_negative_balance);
  if (maxNegativeBalance !== undefined && maxNegativeBalance < 0) {
    throw new ValidationError("Maximum negative balance cannot be below zero.");
  }
  const annualEntitlementDays = asNumber(payload.annual_entitlement_days);
  if (annualEntitlementDays !== undefined && annualEntitlementDays < 0) {
    throw new ValidationError("Annual entitlement cannot be below zero.");
  }
  const accrualAmount = asNumber(payload.accrual_amount);
  if (accrualAmount !== undefined && accrualAmount < 0) {
    throw new ValidationError("Accrual amount cannot be below zero.");
  }
  const carryForwardLimit = asNumber(payload.carry_forward_limit_days);
  if (carryForwardLimit !== undefined && carryForwardLimit < 0) {
    throw new ValidationError("Carry-forward limit cannot be below zero.");
  }
  const carryForwardExpiryMonth = asNumber(payload.carry_forward_expiry_month);
  if (carryForwardExpiryMonth !== undefined && (!Number.isInteger(carryForwardExpiryMonth) || carryForwardExpiryMonth < 1 || carryForwardExpiryMonth > 12)) {
    throw new ValidationError("Carry-forward expiry month must be between 1 and 12.");
  }
  const carryForwardExpiryDay = asNumber(payload.carry_forward_expiry_day);
  if (carryForwardExpiryDay !== undefined && (!Number.isInteger(carryForwardExpiryDay) || carryForwardExpiryDay < 1 || carryForwardExpiryDay > 31)) {
    throw new ValidationError("Carry-forward expiry day must be between 1 and 31.");
  }
  const sortOrder = asNumber(payload.sort_order);
  return {
    is_enabled: asBoolean(payload.is_enabled),
    is_paid: asBoolean(payload.is_paid),
    default_days: payload.default_days === null ? null : defaultDays,
    requires_attachment: asBoolean(payload.requires_attachment),
    affects_payroll: asBoolean(payload.affects_payroll),
    requires_balance: asBoolean(payload.requires_balance),
    allow_negative_balance: asBoolean(payload.allow_negative_balance),
    max_negative_balance: payload.max_negative_balance === null ? null : maxNegativeBalance,
    accrual_enabled: asBoolean(payload.accrual_enabled),
    accrual_frequency: frequency,
    annual_entitlement_days: payload.annual_entitlement_days === null ? null : annualEntitlementDays,
    accrual_amount: payload.accrual_amount === null ? null : accrualAmount,
    prorate_on_joining: asBoolean(payload.prorate_on_joining),
    prorate_on_termination: asBoolean(payload.prorate_on_termination),
    carry_forward_enabled: asBoolean(payload.carry_forward_enabled),
    carry_forward_limit_days: payload.carry_forward_limit_days === null ? null : carryForwardLimit,
    carry_forward_expiry_month: payload.carry_forward_expiry_month === null ? null : carryForwardExpiryMonth,
    carry_forward_expiry_day: payload.carry_forward_expiry_day === null ? null : carryForwardExpiryDay,
    half_day_enabled: asBoolean(payload.half_day_enabled),
    sort_order: sortOrder === undefined ? undefined : Math.trunc(sortOrder),
    reason: requireReason(payload.reason),
  };
};

export const validatePolicyFilters = (query: Record<string, unknown>): LeavePolicyFilters => ({
  employee_type: asString(query.employee_type),
  leave_type_id: asString(query.leave_type_id),
  status: asString(query.status),
  effective_from: asString(query.effective_from),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validatePolicyCreate = (payload: unknown): LeavePolicyInput => {
  if (!isObject(payload)) throw new ValidationError();
  const policyName = asString(payload.policy_name);
  const leaveTypeId = asString(payload.leave_type_id);
  const entitlementDays = asNumber(payload.entitlement_days);
  const effectiveFrom = requireDate(payload.effective_from, "Please choose a valid effective date.");
  const status = asString(payload.status);
  if (!policyName) throw new ValidationError("Policy name is required.");
  if (!leaveTypeId) throw new ValidationError("Leave type is required.");
  if (entitlementDays === undefined || entitlementDays < 0) throw new ValidationError("Please enter a valid entitlement amount.");
  if (status && !LEAVE_POLICY_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid policy status.");
  return {
    policy_name: policyName,
    employee_type: asOptionalString(payload.employee_type),
    leave_type_id: leaveTypeId,
    entitlement_days: entitlementDays,
    carry_forward_days: asNumber(payload.carry_forward_days) ?? 0,
    allow_negative_balance: asBoolean(payload.allow_negative_balance) ?? false,
    max_continuous_days: payload.max_continuous_days === null ? null : asNumber(payload.max_continuous_days),
    effective_from: effectiveFrom,
    effective_to: asOptionalString(payload.effective_to),
    status,
    reason: requireReason(payload.reason),
  };
};

export const validatePolicyUpdate = (payload: unknown): LeavePolicyUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const status = asString(payload.status);
  if (status && !LEAVE_POLICY_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid policy status.");
  const entitlementDays = asNumber(payload.entitlement_days);
  if (entitlementDays !== undefined && entitlementDays < 0) throw new ValidationError("Please enter a valid entitlement amount.");
  return {
    policy_name: asString(payload.policy_name),
    employee_type: asOptionalString(payload.employee_type),
    leave_type_id: asString(payload.leave_type_id),
    entitlement_days: entitlementDays,
    carry_forward_days: asNumber(payload.carry_forward_days),
    allow_negative_balance: asBoolean(payload.allow_negative_balance),
    max_continuous_days: payload.max_continuous_days === null ? null : asNumber(payload.max_continuous_days),
    effective_from: payload.effective_from ? requireDate(payload.effective_from, "Please choose a valid effective date.") : undefined,
    effective_to: asOptionalString(payload.effective_to),
    status,
    reason: requireReason(payload.reason),
  };
};

export const validateLeaveTypePolicyRuleUpdate = (payload: unknown): LeaveTypePolicyRuleUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const paidStatus = asString(payload.paid_status);
  if (paidStatus && !["paid", "partial_paid", "partially_paid", "unpaid"].includes(paidStatus)) {
    throw new ValidationError("Please select a valid paid status.");
  }
  const paidPercentage = asNumber(payload.paid_percentage);
  if (paidPercentage !== undefined && (paidPercentage < 0 || paidPercentage > 100)) {
    throw new ValidationError("Paid percentage must be between 0 and 100.");
  }
  const documentRequirement = asString(payload.document_required_mode) ?? asString(payload.document_requirement);
  if (
    documentRequirement &&
    !["never", "always", "after_consecutive_days", "after_used_days", "after_consecutive_or_used_days", "custom"].includes(documentRequirement)
  ) {
    throw new ValidationError("Please select a valid document rule.");
  }
  const documentAfterDays = asNumber(payload.document_required_after_consecutive_days) ?? asNumber(payload.document_after_days);
  const documentAfterUsedDays = asNumber(payload.document_required_after_used_days) ?? asNumber(payload.document_after_used_days);
  const allowNoDocumentUntilUsedDays = asNumber(payload.allow_no_document_until_used_days);
  const annualEntitlementDays = asNumber(payload.annual_entitlement_days);
  if (documentAfterDays !== undefined && documentAfterDays < 0) throw new ValidationError("Document day threshold cannot be below zero.");
  if (documentAfterUsedDays !== undefined && documentAfterUsedDays < 0) throw new ValidationError("Document used-day threshold cannot be below zero.");
  if (allowNoDocumentUntilUsedDays !== undefined && allowNoDocumentUntilUsedDays < 0) throw new ValidationError("No-document allowance cannot be below zero.");
  if (annualEntitlementDays !== undefined && annualEntitlementDays < 0) throw new ValidationError("Annual entitlement cannot be below zero.");
  const deductionMode = asString(payload.deduction_mode);
  if (deductionMode && !["none", "basic_salary", "selected_allowance", "selected_pay_components", "allowance_first_then_basic", "custom", "full_day", "partial_percentage"].includes(deductionMode)) {
    throw new ValidationError("Please select a valid deduction mode.");
  }
  const dailyRateMethod = asString(payload.deduction_daily_rate_method);
  if (dailyRateMethod && !["payroll_working_days", "calendar_days", "fixed_30_days", "custom_divisor"].includes(dailyRateMethod)) {
    throw new ValidationError("Please select a valid deduction daily rate method.");
  }
  const deductionCustomDivisor = asNumber(payload.deduction_custom_divisor);
  if (deductionCustomDivisor !== undefined && deductionCustomDivisor <= 0) {
    throw new ValidationError("Custom deduction divisor must be greater than zero.");
  }
  const carryForwardLimitDays = asNumber(payload.carry_forward_limit_days);
  if (carryForwardLimitDays !== undefined && carryForwardLimitDays < 0) {
    throw new ValidationError("Carry-forward limit cannot be below zero.");
  }
  const resetPeriod = asString(payload.reset_period);
  if (resetPeriod && !["calendar_year", "company_leave_year", "employee_anniversary"].includes(resetPeriod)) {
    throw new ValidationError("Please select a valid reset period.");
  }
  return {
    paid_status: paidStatus as LeaveTypePolicyRuleUpdateInput["paid_status"],
    annual_entitlement_days: payload.annual_entitlement_days === null ? null : annualEntitlementDays,
    paid_percentage: paidPercentage,
    payroll_impact_enabled: asBoolean(payload.payroll_impact_enabled),
    document_requirement: documentRequirement as LeaveTypePolicyRuleUpdateInput["document_requirement"],
    document_required_mode: documentRequirement as LeaveTypePolicyRuleUpdateInput["document_required_mode"],
    document_after_days: payload.document_after_days === null ? null : documentAfterDays,
    document_required_after_consecutive_days: payload.document_required_after_consecutive_days === null ? null : documentAfterDays,
    document_after_used_days: payload.document_after_used_days === null ? null : documentAfterUsedDays,
    document_required_after_used_days: payload.document_required_after_used_days === null ? null : documentAfterUsedDays,
    allow_no_document_until_used_days: payload.allow_no_document_until_used_days === null ? null : allowNoDocumentUntilUsedDays,
    require_document_for_backdated_request: asBoolean(payload.require_document_for_backdated_request),
    require_document_for_extension: asBoolean(payload.require_document_for_extension),
    approval_required: asBoolean(payload.approval_required),
    approval_workflow_key: asOptionalString(payload.approval_workflow_key),
    salary_deduction_enabled: asBoolean(payload.salary_deduction_enabled),
    deduction_mode: deductionMode,
    deduction_component: asString(payload.deduction_component),
    deduction_component_keys_json: payload.deduction_component_keys_json === null ? null : asString(payload.deduction_component_keys_json),
    deduction_pay_component_keys: payload.deduction_pay_component_keys === null ? null : asString(payload.deduction_pay_component_keys),
    deduction_daily_rate_method: dailyRateMethod,
    deduction_custom_divisor: payload.deduction_custom_divisor === null ? null : deductionCustomDivisor,
    payroll_source_label: asOptionalString(payload.payroll_source_label),
    allow_half_day: asBoolean(payload.allow_half_day),
    allow_carry_forward: asBoolean(payload.allow_carry_forward),
    carry_forward_limit_days: payload.carry_forward_limit_days === null ? null : carryForwardLimitDays,
    reset_period: resetPeriod,
    count_weekends: asBoolean(payload.count_weekends),
    count_public_holidays: asBoolean(payload.count_public_holidays),
    notes: asOptionalString(payload.notes),
    is_enabled: asBoolean(payload.is_enabled),
    reason: requireReason(payload.reason),
  };
};

export const validateBalanceFilters = (query: Record<string, unknown>): LeaveBalanceFilters => ({
  employee_id: asString(query.employee_id),
  outlet_id: asString(query.outlet_id),
  department_id: asString(query.department_id),
  leave_type_id: asString(query.leave_type_id),
  year: asNumber(query.year),
  status: asString(query.status),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateBalanceAdjust = (payload: unknown): LeaveBalanceAdjustInput => {
  if (!isObject(payload)) throw new ValidationError();
  const leaveTypeId = asString(payload.leave_type_id);
  const year = asNumber(payload.year);
  const adjustmentDays = asNumber(payload.adjustment_days);
  if (!leaveTypeId) throw new ValidationError("Leave type is required.");
  if (!year || !Number.isInteger(year)) throw new ValidationError("Please select a valid leave year.");
  if (adjustmentDays === undefined || !Number.isFinite(adjustmentDays)) throw new ValidationError("Please enter a valid adjustment amount.");
  return {
    leave_type_id: leaveTypeId,
    year,
    adjustment_days: adjustmentDays,
    reason: requireReason(payload.reason),
  };
};

export const validateOpeningBalance = (payload: unknown): LeaveOpeningBalanceInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeId = asString(payload.employee_id);
  const leaveTypeId = asString(payload.leave_type_id);
  const year = asNumber(payload.year);
  const openingBalance = asNumber(payload.opening_balance);
  if (!employeeId) throw new ValidationError("Employee is required.");
  if (!leaveTypeId) throw new ValidationError("Leave type is required.");
  if (!year || !Number.isInteger(year)) throw new ValidationError("Please select a valid leave year.");
  if (openingBalance === undefined || !Number.isFinite(openingBalance)) throw new ValidationError("Please enter a valid opening balance.");
  return {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    year,
    opening_balance: openingBalance,
    reason: requireReason(payload.reason),
  };
};

export const validateTransactionFilters = (
  query: Record<string, unknown>,
  employeeId: string,
): LeaveBalanceTransactionFilters => ({
  employee_id: employeeId,
  leave_type_id: asString(query.leave_type_id),
  year: asNumber(query.year),
  transaction_type: asString(query.transaction_type),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateAccrualInput = (payload: unknown): LeaveAccrualInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    as_of_date: requireDate(payload.as_of_date, "Please choose a valid accrual date."),
    employee_id: asString(payload.employee_id),
    leave_type_id: asString(payload.leave_type_id),
    outlet_id: asString(payload.outlet_id),
    department_id: asString(payload.department_id),
    preview: asBoolean(payload.preview),
    reason: asString(payload.reason),
  };
};

export const validateCarryForwardInput = (payload: unknown): LeaveCarryForwardInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeId = asString(payload.employee_id);
  const leaveTypeId = asString(payload.leave_type_id);
  const sourceYear = asNumber(payload.source_year);
  const destinationYear = asNumber(payload.destination_year);
  if (!employeeId) throw new ValidationError("Employee is required.");
  if (!leaveTypeId) throw new ValidationError("Leave type is required.");
  if (!sourceYear || !Number.isInteger(sourceYear)) throw new ValidationError("Please select a valid source year.");
  if (!destinationYear || !Number.isInteger(destinationYear)) throw new ValidationError("Please select a valid destination year.");
  return { employee_id: employeeId, leave_type_id: leaveTypeId, source_year: sourceYear, destination_year: destinationYear, reason: requireReason(payload.reason) };
};

export const validateExpiryInput = (payload: unknown): LeaveExpiryInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeId = asString(payload.employee_id);
  const leaveTypeId = asString(payload.leave_type_id);
  const year = asNumber(payload.year);
  const expiryDays = asNumber(payload.expiry_days);
  if (!employeeId) throw new ValidationError("Employee is required.");
  if (!leaveTypeId) throw new ValidationError("Leave type is required.");
  if (!year || !Number.isInteger(year)) throw new ValidationError("Please select a valid leave year.");
  if (expiryDays === undefined || expiryDays <= 0) throw new ValidationError("Please enter a valid expiry amount.");
  return {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    year,
    expiry_days: expiryDays,
    effective_date: requireDate(payload.effective_date, "Please choose a valid expiry date."),
    reason: requireReason(payload.reason),
  };
};

export const validateRequestFilters = (query: Record<string, unknown>): LeaveRequestFilters => {
  const status = asString(query.status);
  if (status && !LEAVE_REQUEST_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid leave status.");
  const sortBy = asString(query.sort_by) ?? "created_at";
  const allowedSort = ["created_at", "start_date", "end_date", "employee_name", "leave_type_name", "status"];
  return {
    status,
    employee_id: asString(query.employee_id),
    outlet_id: asString(query.outlet_id),
    department_id: asString(query.department_id),
    leave_type_id: asString(query.leave_type_id),
    date_from: asString(query.date_from),
    date_to: asString(query.date_to),
    employee_type: asString(query.employee_type),
    approval_status: asString(query.approval_status),
    page: page(query.page),
    page_size: pageSize(query.page_size),
    sort_by: allowedSort.includes(sortBy) ? sortBy : "created_at",
    sort_direction: asString(query.sort_direction)?.toLowerCase() === "asc" ? "asc" : "desc",
  };
};

export const validateLeaveRequestCreate = (payload: unknown): LeaveRequestInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeId = asString(payload.employee_id);
  const leaveTypeId = asString(payload.leave_type_id);
  if (!employeeId) throw new ValidationError("Employee is required.");
  if (!leaveTypeId) throw new ValidationError("Leave type is required.");
  const startDate = requireDate(payload.start_date, "Please choose a valid leave start date.");
  const endDate = requireDate(payload.end_date, "Please choose a valid leave end date.");
  validateDateRange(startDate, endDate);
  return {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    start_date: startDate,
    end_date: endDate,
    reason: asOptionalString(payload.reason),
    supporting_document_id: asOptionalString(payload.supporting_document_id),
    supporting_document_attached: asBoolean(payload.supporting_document_attached),
  };
};

export const validateLeavePolicyPreview = (payload: unknown): LeavePolicyPreviewInput => {
  const input = validateLeaveRequestCreate(payload);
  return {
    ...input,
    is_extension: isObject(payload) ? asBoolean(payload.is_extension) : undefined,
    is_backdated: isObject(payload) ? asBoolean(payload.is_backdated) : undefined,
  };
};

export const validateLeaveRequestUpdate = (payload: unknown): LeaveRequestUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const startDate = payload.start_date ? requireDate(payload.start_date, "Please choose a valid leave start date.") : undefined;
  const endDate = payload.end_date ? requireDate(payload.end_date, "Please choose a valid leave end date.") : undefined;
  if (startDate && endDate) validateDateRange(startDate, endDate);
  return {
    employee_id: asString(payload.employee_id),
    leave_type_id: asString(payload.leave_type_id),
    start_date: startDate,
    end_date: endDate,
    reason: asOptionalString(payload.reason),
    supporting_document_id: asOptionalString(payload.supporting_document_id),
    supporting_document_attached: asBoolean(payload.supporting_document_attached),
  };
};

export const validateLeaveAction = (payload: unknown): LeaveActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: requireReason(payload.reason) };
};

export const validateLeaveDelegate = (payload: unknown): LeaveDelegateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const delegatedTo = asString(payload.delegated_to);
  if (!delegatedTo) throw new ValidationError("Please choose the delegated approver.");
  return { delegated_to: delegatedTo, reason: requireReason(payload.reason) };
};

export const validateCalendarFilters = (query: Record<string, unknown>): LeaveCalendarFilters => ({
  date_from: asString(query.date_from),
  date_to: asString(query.date_to),
  outlet_id: asString(query.outlet_id),
  employee_id: asString(query.employee_id),
  leave_type_id: asString(query.leave_type_id),
  status: asString(query.status),
});
