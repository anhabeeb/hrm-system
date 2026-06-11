import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { sanitizeForDisplay } from "@/lib/safe-display";
import { formatDate } from "./leave-format";
import type { LeaveRequest } from "./leave.types";

export const LeaveRequestDetailDrawer = ({ request, open, onOpenChange }: { request: LeaveRequest | null; open: boolean; onOpenChange: (open: boolean) => void }) => (
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
      <DetailSection title="Notes / Reason" rows={[{ label: "Reason", value: request.reason ?? "Not recorded" }, { label: "Decision reason", value: request.rejection_reason ?? "Not recorded" }]} />
      <DetailSection title="Sanitized payload" rows={[{ label: "Data", value: <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(request), null, 2)}</pre> }]} />
    </> : null}
  </DetailDrawer>
);
