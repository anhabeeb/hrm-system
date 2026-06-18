import type {
  LeaveEmployeeRecord,
  LeavePolicyEvaluationResult,
  LeavePolicyPreviewInput,
  LeavePolicyRecord,
  LeaveTypePolicyRuleRecord,
  LeaveTypeRecord,
} from "./leave.types";
import * as repository from "./leave.repository";
import { NotFoundError, ValidationError } from "../../utils/errors";

export const findApplicablePolicy = (
  env: Env,
  companyId: string,
  employee: LeaveEmployeeRecord,
  leaveTypeId: string,
  effectiveDate: string,
): Promise<LeavePolicyRecord | null> =>
  repository.findActivePolicyForEmployee(
    env,
    companyId,
    employee.employee_type,
    leaveTypeId,
    effectiveDate,
  );

export const shouldCheckBalance = (leaveType: LeaveTypeRecord): boolean =>
  (leaveType.requires_balance ?? (leaveType.is_paid === 1 && (leaveType.default_days ?? 0) > 0 ? 1 : 0)) === 1;

const isSickLeave = (leaveType: LeaveTypeRecord) => {
  const text = `${leaveType.leave_key ?? ""} ${leaveType.leave_name ?? ""}`.toLowerCase();
  return text.includes("sick");
};

const isFamilyResponsibilityLeave = (leaveType: LeaveTypeRecord) => {
  const text = `${leaveType.leave_key ?? ""} ${leaveType.leave_name ?? ""}`.toLowerCase();
  return /\bfrl\b/.test(text) || text.includes("family_responsibility_leave") || text.includes("family responsibility");
};

const isUnpaidLeave = (leaveType: LeaveTypeRecord) => {
  const text = `${leaveType.leave_key ?? ""} ${leaveType.leave_name ?? ""}`.toLowerCase();
  return leaveType.is_paid !== 1 || text.includes("unpaid");
};

export const defaultPolicyRuleForLeaveType = (leaveType: LeaveTypeRecord): LeaveTypePolicyRuleRecord => {
  const sick = isSickLeave(leaveType);
  const frl = isFamilyResponsibilityLeave(leaveType);
  const unpaid = isUnpaidLeave(leaveType);
  return {
    id: `${leaveType.company_id}_leave_policy_rule_${leaveType.id}`,
    company_id: leaveType.company_id,
    leave_type_id: leaveType.id,
    leave_type_key: leaveType.leave_key ?? null,
    leave_type_name: leaveType.leave_name,
    leave_key: leaveType.leave_key,
    annual_entitlement_days: frl ? 10 : sick ? 30 : leaveType.annual_entitlement_days ?? null,
    paid_status: unpaid ? "unpaid" : "paid",
    paid_percentage: unpaid ? 0 : 100,
    payroll_impact_enabled: unpaid || leaveType.affects_payroll === 1 ? 1 : 0,
    document_requirement: frl
      ? "after_consecutive_days"
      : sick
      ? "after_consecutive_or_used_days"
      : leaveType.requires_attachment === 1
        ? "always"
        : "never",
    document_required_mode: frl
      ? "after_consecutive_days"
      : sick
      ? "after_consecutive_or_used_days"
      : leaveType.requires_attachment === 1
        ? "always"
        : "never",
    document_after_days: frl || sick ? 2 : null,
    document_required_after_consecutive_days: frl || sick ? 2 : null,
    document_after_used_days: sick ? 15 : null,
    document_required_after_used_days: sick ? 15 : null,
    allow_no_document_until_used_days: sick ? 15 : null,
    require_document_for_backdated_request: 0,
    require_document_for_extension: 0,
    approval_required: 1,
    approval_workflow_key: "leave_request",
    salary_deduction_enabled: unpaid ? 1 : 0,
    deduction_mode: unpaid ? "basic_salary" : "none",
    deduction_component: "leave_policy",
    deduction_component_keys_json: null,
    deduction_pay_component_keys: null,
    deduction_daily_rate_method: "payroll_working_days",
    deduction_custom_divisor: null,
    payroll_source_label: frl ? "family_responsibility_leave_policy" : sick ? "sick_leave_policy" : unpaid ? "unpaid_leave_policy" : "leave_policy",
    allow_half_day: 0,
    allow_carry_forward: leaveType.carry_forward_enabled ?? 0,
    carry_forward_limit_days: leaveType.carry_forward_limit_days ?? null,
    reset_period: "calendar_year",
    count_weekends: 0,
    count_public_holidays: 0,
    notes: frl
      ? "Paid leave. No salary deduction. Documents are required only when a request exceeds 2 consecutive days."
      : sick
      ? "Paid leave. First 15 used sick leave days can be submitted without documents if each request is 2 consecutive days or less."
      : null,
    is_enabled: 1,
    created_at: leaveType.created_at,
    updated_at: leaveType.updated_at,
    created_by: null,
    updated_by: null,
  };
};

export const resolvePolicyRule = async (env: Env, companyId: string, leaveType: LeaveTypeRecord) =>
  await repository.findLeaveTypePolicyRule(env, companyId, leaveType.id) ?? defaultPolicyRuleForLeaveType(leaveType);

const calendarDaysInclusive = (startDate: string, endDate: string) => {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new ValidationError("Please choose a valid leave date range.");
  }
  return Math.floor((end - start) / 86_400_000) + 1;
};

const documentRequiredReason = (
  rule: LeaveTypePolicyRuleRecord,
  requestedDays: number,
  usedDaysInYear: number,
) => {
  const requirement = String(rule.document_required_mode ?? rule.document_requirement ?? "never");
  const consecutiveThreshold = Number(rule.document_required_after_consecutive_days ?? rule.document_after_days ?? 0);
  const usedThreshold = Number(rule.document_required_after_used_days ?? rule.document_after_used_days ?? rule.allow_no_document_until_used_days ?? 0);
  const consecutiveMatched = consecutiveThreshold > 0 && requestedDays > consecutiveThreshold;
  const usedMatched = usedThreshold > 0 && usedDaysInYear + requestedDays > usedThreshold;

  if (requirement === "always") return "Documents are required for this leave type.";
  if (requirement === "after_consecutive_days" && consecutiveMatched) {
    return `Documents are required because this request exceeds ${consecutiveThreshold} consecutive day(s).`;
  }
  if (requirement === "after_used_days" && usedMatched) {
    return `Documents are required because this request exceeds ${usedThreshold} used day(s) in the leave year.`;
  }
  if (requirement === "after_consecutive_or_used_days" && (consecutiveMatched || usedMatched)) {
    return consecutiveMatched
      ? `Documents are required because this request exceeds ${consecutiveThreshold} consecutive day(s).`
      : `Documents are required because this request exceeds ${usedThreshold} used day(s) in the leave year.`;
  }
  return null;
};

export const evaluateLeavePolicy = async (
  env: Env,
  companyId: string,
  input: LeavePolicyPreviewInput & { total_days?: number; exclude_request_id?: string },
): Promise<LeavePolicyEvaluationResult> => {
  const leaveType = await repository.findLeaveType(env, companyId, input.leave_type_id);
  if (!leaveType) throw new NotFoundError("Leave type could not be found.");

  const employee = await repository.findEmployee(env, companyId, input.employee_id);
  if (!employee) throw new NotFoundError("Employee could not be found.");

  const requestedDays = input.total_days ?? calendarDaysInclusive(input.start_date, input.end_date);
  const rule = await resolvePolicyRule(env, companyId, leaveType);
  const usedDaysInYear = await repository.sumApprovedLeaveDaysForYear(
    env,
    companyId,
    input.employee_id,
    input.leave_type_id,
    Number(input.start_date.slice(0, 4)),
    input.exclude_request_id,
  );

  const warnings: string[] = [];
  const blockingErrors: string[] = [];
  if (leaveType.is_enabled !== 1 || rule.is_enabled !== 1) {
    blockingErrors.push("This leave type is currently disabled.");
  }
  if (input.is_backdated) warnings.push("This request is backdated and may require additional review.");
  if (input.is_extension) warnings.push("This request extends existing leave and should be reviewed with current balances.");

  let documentReason = documentRequiredReason(rule, requestedDays, usedDaysInYear);
  if (!documentReason && input.is_backdated && rule.require_document_for_backdated_request === 1) {
    documentReason = "Documents are required because this request is backdated.";
  }
  if (!documentReason && input.is_extension && rule.require_document_for_extension === 1) {
    documentReason = "Documents are required because this request extends an existing leave request.";
  }
  const paidPercentage = Math.max(0, Math.min(100, Number(rule.paid_percentage ?? 100)));
  const salaryDeductionRequired =
    rule.salary_deduction_enabled === 1 ||
    rule.paid_status === "unpaid" ||
    rule.paid_status === "partial_paid" ||
    rule.paid_status === "partially_paid" ||
    paidPercentage < 100;
  const deductibleDays = salaryDeductionRequired ? requestedDays : 0;

  return {
    leave_type_id: leaveType.id,
    leave_type_name: leaveType.leave_name,
    rule_id: rule.id ?? null,
    requested_days: requestedDays,
    used_days_in_year: usedDaysInYear,
    paid_status: String(rule.paid_status ?? "paid"),
    paid_percentage: paidPercentage,
    approval_required: rule.approval_required === 1,
    document_required: Boolean(documentReason),
    document_requirement: String(rule.document_required_mode ?? rule.document_requirement ?? "never"),
    document_reason: documentReason,
    salary_deduction_required: salaryDeductionRequired,
    deductible_days: deductibleDays,
    deduction_mode: String(rule.deduction_mode ?? "none"),
    deduction_component: String(rule.deduction_component ?? "leave_policy"),
    deduction_component_keys_json: rule.deduction_pay_component_keys ?? rule.deduction_component_keys_json ?? null,
    payroll_source_label: rule.payroll_source_label ?? "leave_policy",
    deduction_source_label: rule.payroll_source_label ?? rule.deduction_component ?? "leave_policy",
    warnings,
    blocking_errors: blockingErrors,
  };
};
