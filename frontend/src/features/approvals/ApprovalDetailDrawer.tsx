import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import { approvalTitle } from "./approval-format";
import type { ApprovalHistory, ApprovalRequest } from "./approvals.types";
import { ApprovalHistoryTable } from "./ApprovalHistoryTable";

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
          { label: "Created", value: formatDateTime(approval.created_at) },
        ]} />
        <DetailSection title="Safe Payload Summary" rows={[{ label: "Payload", value: <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(approval.payload_json ?? {}, null, 2)}</pre> }]} />
        <ApprovalHistoryTable rows={history} loading={historyLoading} />
      </>
    ) : null}
  </DetailDrawer>
);
