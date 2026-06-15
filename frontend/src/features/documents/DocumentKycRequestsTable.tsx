import { CheckCircle2, Eye, PlayCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DocumentKycRequestRecord } from "./documents.types";

interface DocumentKycRequestsTableProps {
  rows: DocumentKycRequestRecord[];
  loading?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
  canCancel?: boolean;
  canApply?: boolean;
  onView?: (row: DocumentKycRequestRecord) => void;
  onApprove?: (row: DocumentKycRequestRecord) => void;
  onReject?: (row: DocumentKycRequestRecord) => void;
  onCancel?: (row: DocumentKycRequestRecord) => void;
  onApply?: (row: DocumentKycRequestRecord) => void;
}

const actionable = (status?: string) => !["APPLIED", "REJECTED", "CANCELLED", "FAILED_TO_APPLY"].includes(status ?? "");

export const DocumentKycRequestsTable = ({ rows, loading, canApprove, canReject, canCancel, canApply, onView, onApprove, onReject, onCancel, onApply }: DocumentKycRequestsTableProps) => (
  <div className="rounded-lg border bg-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Document / field</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading document/KYC requests...</TableCell></TableRow> : null}
        {!loading && rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-muted-foreground">No document/KYC requests found.</TableCell></TableRow> : null}
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell><div className="font-medium">{row.employee_name ?? row.employee_id}</div><div className="text-xs text-muted-foreground">{row.employee_code}</div></TableCell>
            <TableCell>{row.request_type}</TableCell>
            <TableCell>{row.document_type ?? row.requested_field ?? "General update"}</TableCell>
            <TableCell>{row.status}</TableCell>
            <TableCell>{row.updated_at ? new Date(row.updated_at).toLocaleString() : "-"}</TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {onView ? <Button variant="ghost" size="sm" onClick={() => onView(row)}><Eye className="h-4 w-4" />View</Button> : null}
                {canApprove && actionable(row.status) ? <Button variant="ghost" size="sm" onClick={() => onApprove?.(row)}><CheckCircle2 className="h-4 w-4" />Approve</Button> : null}
                {canReject && actionable(row.status) ? <Button variant="ghost" size="sm" onClick={() => onReject?.(row)}><XCircle className="h-4 w-4" />Reject</Button> : null}
                {canApply && row.status === "PENDING_APPLICATION" ? <Button variant="ghost" size="sm" onClick={() => onApply?.(row)}><PlayCircle className="h-4 w-4" />Apply</Button> : null}
                {canCancel && actionable(row.status) ? <Button variant="ghost" size="sm" onClick={() => onCancel?.(row)}>Cancel</Button> : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
