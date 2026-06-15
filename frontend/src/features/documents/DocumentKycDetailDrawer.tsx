import { useQuery } from "@tanstack/react-query";

import { StatusBadge } from "@/components/data/StatusBadge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/safe-display";
import { documentsApi } from "./documents.api";
import type { DocumentKycRequestRecord } from "./documents.types";

interface DocumentKycDetailDrawerProps {
  request: DocumentKycRequestRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const parseJsonObject = (value?: string | null) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const valueRows = (currentValue?: string | null, requestedValue?: string | null) => {
  const current = parseJsonObject(currentValue);
  const requested = parseJsonObject(requestedValue);
  return Array.from(new Set([...Object.keys(current), ...Object.keys(requested)])).map((field) => ({
    field,
    current: current[field],
    requested: requested[field],
  }));
};

const displayValue = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const timelineRows = (timeline: any) => [
  ...(timeline?.steps ?? []).map((step: any) => ({
    id: step.id ?? `${step.step_order}-${step.step_name}`,
    label: step.step_name ?? step.step_code ?? "Approval step",
    status: step.status,
    at: step.approved_at ?? step.rejected_at ?? step.skipped_at ?? step.escalated_at ?? step.updated_at ?? step.created_at,
    detail: step.fallback_applied ?? step.assigned_approver_user_id ?? step.approver_resolver_type,
  })),
  ...(timeline?.actions ?? []).map((action: any) => ({
    id: action.id,
    label: action.action ?? "Action",
    status: action.to_status ?? action.action,
    at: action.created_at,
    detail: action.reason ?? action.comment,
  })),
];

export const DocumentKycDetailDrawer = ({ request, open, onOpenChange }: DocumentKycDetailDrawerProps) => {
  const timelineQuery = useQuery({
    queryKey: ["documents", "kyc-timeline", request?.id],
    queryFn: () => documentsApi.kycTimeline(request!.id),
    enabled: open && Boolean(request?.id),
  });
  const timeline = timelineQuery.data?.data as any;
  const rows = request ? valueRows(request.current_value_json, request.requested_value_json) : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Document / KYC request</DialogTitle>
          <DialogDescription>{request ? `${request.request_type} for ${request.employee_name ?? request.employee_id}` : "Request details"}</DialogDescription>
        </DialogHeader>
        {request ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <div><span className="text-muted-foreground">Status</span><div><StatusBadge status={request.status} /></div></div>
              <div><span className="text-muted-foreground">Verification</span><div><StatusBadge status={request.verification_status ?? "-"} /></div></div>
              <div><span className="text-muted-foreground">Current step</span><div className="font-medium">{request.approval_current_step ?? timeline?.request?.current_step_name ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Document type</span><div>{request.document_type ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Document number</span><div>{request.document_number ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Requested field</span><div>{request.requested_field ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Issue date</span><div>{formatDate(request.issue_date)}</div></div>
              <div><span className="text-muted-foreground">Expiry date</span><div>{formatDate(request.expiry_date)}</div></div>
              <div><span className="text-muted-foreground">Issuing country</span><div>{request.issuing_country ?? "-"}</div></div>
              <div className="md:col-span-3"><span className="text-muted-foreground">Reason</span><div>{request.reason}</div></div>
            </div>
            {request.apply_error_message ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">{request.apply_error_message}</div> : null}
            <div>
              <div className="mb-2 font-medium">Requested changes</div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Current</TableHead><TableHead>Requested</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rows.length === 0 ? <TableRow><TableCell colSpan={3} className="text-muted-foreground">No profile field changes recorded.</TableCell></TableRow> : null}
                    {rows.map((row) => <TableRow key={row.field}><TableCell>{row.field}</TableCell><TableCell>{displayValue(row.current)}</TableCell><TableCell>{displayValue(row.requested)}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <div className="mb-2 font-medium">Approval timeline</div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Step / action</TableHead><TableHead>Status</TableHead><TableHead>When</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {timelineQuery.isLoading ? <TableRow><TableCell colSpan={4} className="text-muted-foreground">Loading approval timeline...</TableCell></TableRow> : null}
                    {!timelineQuery.isLoading && timelineRows(timeline).length === 0 ? <TableRow><TableCell colSpan={4} className="text-muted-foreground">No approval timeline entries yet.</TableCell></TableRow> : null}
                    {timelineRows(timeline).map((row) => <TableRow key={row.id}><TableCell>{row.label}</TableCell><TableCell><StatusBadge status={row.status ?? "PENDING"} /></TableCell><TableCell>{formatDateTime(row.at)}</TableCell><TableCell>{row.detail ?? "-"}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </div>
            </div>
            <details className="rounded-md border bg-muted/30 p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Raw request payload</summary>
              <pre className="mt-2 max-h-40 overflow-auto text-xs">{JSON.stringify(parseJsonObject(request.requested_value_json), null, 2)}</pre>
            </details>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
