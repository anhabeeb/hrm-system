import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import { approvalTitle } from "./approval-format";
import type { ApprovalHistory, ApprovalRequest } from "./approvals.types";
import { ApprovalHistoryTable } from "./ApprovalHistoryTable";

const payloadOf = (approval: ApprovalRequest) =>
  (approval.payload_json ?? approval.payload_summary ?? {}) as Record<string, unknown>;

const money = (amount?: unknown, currency?: unknown) => {
  if (typeof amount !== "number") return "Not recorded";
  return new Intl.NumberFormat("en-MV", {
    style: "currency",
    currency: typeof currency === "string" ? currency : "MVR",
    maximumFractionDigits: 2,
  }).format(amount / 100);
};

const salaryRows = (approval: ApprovalRequest) => {
  const payload = payloadOf(approval);
  const proposed = (payload.proposed_salary ?? {}) as Record<string, unknown>;
  const oldAmount = typeof payload.old_monthly_salary_amount === "number" ? payload.old_monthly_salary_amount : null;
  const newAmount = typeof proposed.monthly_salary_amount === "number" ? proposed.monthly_salary_amount : null;
  return [
    { label: "Current salary", value: money(oldAmount, payload.old_currency) },
    { label: "Proposed salary", value: money(newAmount, proposed.currency ?? payload.old_currency) },
    { label: "Salary difference", value: oldAmount !== null && newAmount !== null ? money(newAmount - oldAmount, proposed.currency ?? payload.old_currency) : "Not recorded" },
    { label: "Change type", value: humanize(String(payload.approval_type ?? proposed.change_type ?? approval.entity_type ?? "salary_change")) },
    { label: "Effective date", value: typeof proposed.effective_from === "string" ? proposed.effective_from : "Not recorded" },
    { label: "Reason", value: typeof proposed.reason === "string" ? proposed.reason : approval.summary ?? "Not recorded" },
    { label: "Requester", value: approval.requested_by_name ?? approval.requested_by ?? "Not recorded" },
  ];
};

const promotionRows = (approval: ApprovalRequest) => {
  const payload = payloadOf(approval);
  const expected = (payload.expected_job ?? {}) as Record<string, unknown>;
  const change = (payload.job_change ?? {}) as Record<string, unknown>;
  const salary = (change.salary_change ?? {}) as Record<string, unknown>;
  return [
    { label: "Current outlet", value: String(expected.outlet_id ?? "Not assigned") },
    { label: "Proposed outlet", value: String(change.new_outlet_id ?? expected.outlet_id ?? "Not assigned") },
    { label: "Current department", value: String(expected.department_id ?? "Not assigned") },
    { label: "Proposed department", value: String(change.new_department_id ?? expected.department_id ?? "Not assigned") },
    { label: "Current position", value: String(expected.position_id ?? "Not assigned") },
    { label: "Proposed position", value: String(change.new_position_id ?? expected.position_id ?? "Not assigned") },
    { label: "Current salary", value: money(payload.old_monthly_salary_amount, payload.old_currency) },
    { label: "Proposed salary", value: money(salary.monthly_salary_amount, salary.currency ?? payload.old_currency) },
    { label: "Effective date", value: typeof change.effective_from === "string" ? change.effective_from : "Not recorded" },
    { label: "Reason", value: typeof change.reason === "string" ? change.reason : approval.summary ?? "Not recorded" },
    { label: "Requester", value: approval.requested_by_name ?? approval.requested_by ?? "Not recorded" },
  ];
};

const flagLabel = (value: unknown) => value === true || value === 1 ? "Yes" : "No";

const componentValue = (component: Record<string, unknown>) => {
  if (typeof component.amount !== "number") return "Not recorded";
  if (component.calculation_type === "percentage_of_basic_salary") return `${component.amount}% of basic salary`;
  if (component.calculation_type === "non_cash_benefit") return `${money(component.amount, component.currency)} non-cash`;
  return money(component.amount, component.currency);
};

const compensationRows = (approval: ApprovalRequest) => {
  const payload = payloadOf(approval);
  const current = (payload.current_component ?? {}) as Record<string, unknown>;
  const proposed = (payload.proposed_component ?? {}) as Record<string, unknown>;
  const ending = (payload.end_component ?? {}) as Record<string, unknown>;
  const component = Object.keys(proposed).length > 0 ? proposed : current;
  const action = String(payload.approval_action ?? approval.entity_type ?? "compensation_component_change").replace("compensation_component_", "");

  return [
    { label: "Employee", value: String(approval.employee_name ?? payload.employee_id ?? approval.employee_id ?? "Not linked") },
    { label: "Action", value: humanize(action) },
    { label: "Component", value: String(component.component_name ?? current.component_name ?? "Not recorded") },
    { label: "Component type", value: humanize(String(component.component_type ?? current.component_type ?? "Not recorded")) },
    { label: "Current value", value: Object.keys(current).length > 0 ? componentValue(current) : "New component" },
    { label: "Proposed value", value: Object.keys(proposed).length > 0 ? componentValue(proposed) : "No new value" },
    { label: "Gross effect", value: flagLabel(component.affects_gross_pay ?? current.affects_gross_pay) },
    { label: "Net effect", value: flagLabel(component.affects_net_pay ?? current.affects_net_pay) },
    { label: "Effective date", value: typeof proposed.effective_from === "string" ? proposed.effective_from : "Not recorded" },
    { label: "End date", value: typeof ending.effective_to === "string" ? ending.effective_to : "Not ending" },
    { label: "Reason", value: String(proposed.reason ?? ending.reason ?? approval.summary ?? "Not recorded") },
    { label: "Requester", value: approval.requested_by_name ?? approval.requested_by ?? "Not recorded" },
  ];
};

const businessRows = (approval: ApprovalRequest) =>
  approval.entity_type === "promotion_with_salary_change" ? promotionRows(approval) :
    approval.module === "salary" ? salaryRows(approval) :
      approval.module === "compensation" ? compensationRows(approval) : [];

export const ApprovalDetailDrawer = ({ approval, history, historyLoading, open, onOpenChange }: { approval: ApprovalRequest | null; history: ApprovalHistory[]; historyLoading?: boolean; open: boolean; onOpenChange: (open: boolean) => void }) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={approval ? approvalTitle(approval) : "Approval"} subtitle={approval?.module}>
    {approval ? (
      <>
        <DetailSection title="Summary" rows={[
          { label: "Status", value: <StatusBadge status={approval.status ?? "pending"} /> },
          { label: "Module", value: humanize(approval.module) },
          { label: "Entity", value: humanize(approval.entity_type) },
          { label: "Employee", value: approval.employee_name ?? approval.employee_id ?? "Not linked" },
          { label: "Current step", value: approval.current_step ?? 1 },
          { label: "Applied at", value: approval.applied_at ? formatDateTime(approval.applied_at) : "Not applied" },
          { label: "Action note", value: approval.disabled_reason ?? "No current action blocker." },
          { label: "Created", value: formatDateTime(approval.created_at) },
        ]} />
        {approval.failure_message ? <DetailSection title="Retry / Failure Details" rows={[
          { label: "Failure code", value: approval.failure_code ?? "APPROVAL_APPLY_FAILED" },
          { label: "Failure message", value: approval.failure_message },
        ]} /> : null}
        {businessRows(approval).length > 0 ? <DetailSection title="Request Details" rows={businessRows(approval)} /> : null}
        <DetailSection title="Safe Technical Payload" rows={[{ label: "Payload", value: <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(approval.payload_json ?? {}, null, 2)}</pre> }]} />
        <ApprovalHistoryTable rows={history} loading={historyLoading} />
      </>
    ) : null}
  </DetailDrawer>
);
