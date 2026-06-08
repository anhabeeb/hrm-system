import { useQuery } from "@tanstack/react-query";

import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { StatusBadge } from "@/components/data/StatusBadge";
import { leaveApi } from "./leave.api";
import { formatDate, humanize } from "./leave-format";
import type { LeaveRequest } from "./leave.types";

export const LeaveApprovalTimelineDialog = ({
  request,
  open,
  onOpenChange,
}: {
  request: LeaveRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const query = useQuery({
    queryKey: ["leave", "timeline", request?.id],
    queryFn: () => leaveApi.getTimeline(request!.id),
    enabled: open && Boolean(request?.id),
  });
  const detail = query.data?.data;

  return (
    <DetailDrawer open={open} onOpenChange={onOpenChange} title="Leave approval timeline" subtitle={request?.employee_name ?? request?.employee_id}>
      {query.isError ? <InlineAlert title="Timeline could not be loaded." variant="error" /> : null}
      {detail ? (
        <div className="space-y-4">
          <DetailSection
            title="Request"
            rows={[
              { label: "Employee", value: detail.leave_request.employee_name ?? detail.leave_request.employee_id },
              { label: "Leave type", value: detail.leave_request.leave_type_name ?? detail.leave_request.leave_type_id },
              { label: "Dates", value: `${formatDate(detail.leave_request.start_date)} to ${formatDate(detail.leave_request.end_date)}` },
              { label: "Status", value: <StatusBadge status={detail.leave_request.approval_status ?? detail.leave_request.status} /> },
              { label: "Generic approval", value: detail.generic_approval_request ? `${detail.generic_approval_request.status ?? "pending"} · step ${detail.generic_approval_request.current_step ?? "-"}` : "Not linked" },
            ]}
          />
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-semibold">Approval steps</div>
            <div className="divide-y">
              {detail.approval_steps.length ? detail.approval_steps.map((step) => (
                <div key={step.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[90px_1fr_110px]">
                  <span>Level {step.step_order}</span>
                  <span>{step.required_permission_key ?? humanize(step.approver_type)}{step.delegated_to ? ` delegated to ${step.delegated_to}` : ""}</span>
                  <StatusBadge status={step.status} />
                </div>
              )) : <div className="px-4 py-3 text-sm text-muted-foreground">No approval steps recorded.</div>}
            </div>
          </div>
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-semibold">Balance and audit timeline</div>
            <div className="divide-y">
              {detail.timeline.map((item, index) => (
                <div key={`${item.type}-${index}`} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[140px_1fr_100px]">
                  <span>{formatDate(item.at)}</span>
                  <span>{humanize(item.type)}{item.note ? `: ${item.note}` : ""}</span>
                  <span>{item.quantity_days ? `${item.quantity_days} days` : item.by ?? "-"}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2 text-sm font-semibold">Balance transactions</div>
            <div className="divide-y">
              {detail.balance_transactions.length ? detail.balance_transactions.map((transaction) => (
                <div key={transaction.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[150px_1fr_120px]">
                  <span>{formatDate(transaction.effective_date)}</span>
                  <span>{humanize(transaction.transaction_type)}{transaction.reason ? `: ${transaction.reason}` : ""}</span>
                  <span>{transaction.quantity_days} days</span>
                </div>
              )) : <div className="px-4 py-3 text-sm text-muted-foreground">No balance transactions recorded.</div>}
            </div>
          </div>
        </div>
      ) : null}
    </DetailDrawer>
  );
};
