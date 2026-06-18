import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { sanitizeForDisplay } from "@/lib/safe-display";
import { formatDate } from "./leave-format";
import type { LeaveRequest } from "./leave.types";

const parsePolicySnapshot = (request: LeaveRequest | null) => {
  if (!request?.policy_snapshot_json) return {};
  try {
    const parsed = JSON.parse(request.policy_snapshot_json);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export const LeaveRequestDetailDrawer = ({ request, open, onOpenChange }: { request: LeaveRequest | null; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const policy = parsePolicySnapshot(request);
  return (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title="Leave request detail" subtitle={request?.employee_name ?? request?.employee_id}>
    {request ? <>
      <DetailSection title="Employee" rows={[{ label: "Employee", value: request.employee_name ?? request.employee_id }, { label: "Outlet", value: request.outlet_name ?? request.outlet_id ?? "Not recorded" }]} />
      <DetailSection title="Leave Details" rows={[{ label: "Leave type", value: request.leave_type_name ?? request.leave_type_id }, { label: "Dates", value: `${formatDate(request.start_date)} to ${formatDate(request.end_date)}` }, { label: "Days", value: request.total_days ?? "Not calculated" }, { label: "Status", value: <StatusBadge status={request.status} /> }]} />
      <DetailSection title="Approval" rows={[
        { label: "Approval status", value: <StatusBadge status={request.approval_status ?? request.status} /> },
        { label: "Current step", value: request.approval_current_step ?? "Not linked" },
        { label: "Approval request", value: request.approval_request_id ?? "Not linked" },
        { label: "Department approved", value: request.department_approved_at ? formatDate(request.department_approved_at) : "Pending" },
        { label: "HR approved", value: request.hr_approved_at ? formatDate(request.hr_approved_at) : "Pending" },
      ]} />
      <DetailSection title="Policy impact" rows={[
        { label: "Document required", value: request.document_required ? "Yes" : "No" },
        { label: "Document status", value: request.document_status ?? "not_required" },
        { label: "Document reason", value: request.document_required_reason ?? "Not required" },
        { label: "Payroll impact", value: request.affects_payroll ? "Deduction/review required" : "No payroll deduction" },
        { label: "Deduction mode", value: String(policy.deduction_mode ?? "none") },
        { label: "Deduction source", value: String(policy.deduction_source_label ?? policy.payroll_source_label ?? "Not applicable") },
        { label: "Paid percentage", value: policy.paid_percentage == null ? "Not recorded" : `${policy.paid_percentage}%` },
        { label: "Policy rule", value: request.policy_rule_id ?? "Default policy" },
      ]} />
      <DetailSection title="Notes / Reason" rows={[{ label: "Reason", value: request.reason ?? "Not recorded" }, { label: "Decision reason", value: request.rejection_reason ?? "Not recorded" }]} />
      <DetailSection title="Sanitized payload" rows={[{ label: "Data", value: <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(request), null, 2)}</pre> }]} />
    </> : null}
  </DetailDrawer>
  );
};
