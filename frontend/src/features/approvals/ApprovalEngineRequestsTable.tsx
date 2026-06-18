import { Check, Eye, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ApprovalEngineRequest } from "./approvals.types";

interface ApprovalEngineRequestsTableProps {
  rows: ApprovalEngineRequest[];
  loading?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
  canCancel?: boolean;
  onView: (row: ApprovalEngineRequest) => void;
  onApprove?: (row: ApprovalEngineRequest) => void;
  onReject?: (row: ApprovalEngineRequest) => void;
  onCancel?: (row: ApprovalEngineRequest) => void;
}

const statusTone = (status: string) => {
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED" || status === "CANCELLED") return "bg-red-50 text-red-700";
  if (status === "NEEDS_MANUAL_ASSIGNMENT" || status === "ESCALATED") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-700";
};

const canAct = (row: ApprovalEngineRequest) => row.module_enabled !== false && row.read_only !== true;

export const ApprovalEngineRequestsTable = ({
  rows,
  loading,
  canApprove,
  canReject,
  canCancel,
  onView,
  onApprove,
  onReject,
  onCancel,
}: ApprovalEngineRequestsTableProps) => (
  <div className="rounded-md border bg-white">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Request</TableHead>
          <TableHead>Operation</TableHead>
          <TableHead>Requester</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Current step</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Loading approval requests...</TableCell></TableRow>
        ) : rows.length === 0 ? (
          <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No approval requests found.</TableCell></TableRow>
        ) : rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="font-medium">{row.title}</div>
              <div className="text-xs text-muted-foreground">{row.summary || row.subject_type}</div>
              {row.module_enabled === false ? (
                <div className="mt-1 text-xs font-medium text-amber-700">
                  Module disabled · Read-only while module is disabled
                </div>
              ) : null}
            </TableCell>
            <TableCell>{row.operation_type}</TableCell>
            <TableCell>{row.requester_name || "Unknown"}</TableCell>
            <TableCell>{row.department_name || "Unassigned"}</TableCell>
            <TableCell>{row.current_step_name || "Not started"}</TableCell>
            <TableCell><span className={`rounded-full px-2 py-1 text-xs font-medium ${statusTone(row.status)}`}>{row.status}</span></TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" size="icon" variant="ghost" aria-label="View approval request" onClick={() => onView(row)}><Eye className="h-4 w-4" /></Button>
                {canApprove && canAct(row) ? <Button type="button" size="icon" variant="ghost" aria-label="Approve request" onClick={() => onApprove?.(row)}><Check className="h-4 w-4" /></Button> : null}
                {canReject && canAct(row) ? <Button type="button" size="icon" variant="ghost" aria-label="Reject request" onClick={() => onReject?.(row)}><X className="h-4 w-4" /></Button> : null}
                {canCancel && canAct(row) ? <Button type="button" size="sm" variant="outline" onClick={() => onCancel?.(row)}>Cancel</Button> : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
