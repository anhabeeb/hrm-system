import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { profileUpdateRequestsApi, type ProfileUpdateRequest } from "./profile-update-requests.api";

const parseJson = (value: string | null) => {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const requestTypeLabel = (type: string) =>
  ({
    email_update: "Email Update",
    kyc_update: "KYC Update",
    profile_update: "Profile Update",
    document_update: "Document Update",
  })[type] ?? type.replace(/_/g, " ");

const changesFor = (request: ProfileUpdateRequest) => {
  const oldValue = parseJson(request.old_value_json);
  const nextValue = parseJson(request.requested_value_json);
  if (request.request_type === "email_update") {
    return [
      { label: "Current email", value: String(oldValue.email ?? "Not set") },
      { label: "Requested new email", value: String(nextValue.email ?? "Not provided") },
    ];
  }
  return Object.entries(nextValue).map(([key, value]) => ({ label: key.replace(/_/g, " "), value: String(value ?? "") }));
};

export const ProfileUpdateRequestsPage = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ status: "", request_type: "", user_id: "", date_from: "", date_to: "", page: 1, page_size: 25 });
  const [selected, setSelected] = useState<ProfileUpdateRequest | null>(null);
  const [reason, setReason] = useState("");
  const query = useQuery({ queryKey: ["profile-update-requests", filters], queryFn: () => profileUpdateRequestsApi.list(filters) });
  const close = () => { setSelected(null); setReason(""); };
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["profile-update-requests"] });
  const approve = useMutation({ mutationFn: (request: ProfileUpdateRequest) => profileUpdateRequestsApi.approve(request.id, { reason, review_notes: reason }), onSuccess: () => { invalidate(); close(); } });
  const reject = useMutation({ mutationFn: (request: ProfileUpdateRequest) => profileUpdateRequestsApi.reject(request.id, { reason, review_notes: reason }), onSuccess: () => { invalidate(); close(); } });
  const changes = useMemo(() => (selected ? changesFor(selected) : []), [selected]);

  return (
    <div>
      <PageHeader title="Profile Update Requests" description="Review employee profile, KYC, document, and email update requests before they are applied." />
      <div className="space-y-4 p-4 md:p-6">
        {query.isError ? <InlineAlert title="Profile update requests could not be loaded." variant="error" /> : null}
        {approve.isError || reject.isError ? (
          <InlineAlert title="Request review could not be saved." variant="error">
            {(approve.error ?? reject.error) instanceof Error ? (approve.error ?? reject.error)?.message : undefined}
          </InlineAlert>
        ) : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-5">
          <div>
            <Label>Status</Label>
            <Select value={filters.status || "all"} onValueChange={(value) => setFilters((current) => ({ ...current, status: value === "all" ? "" : value, page: 1 }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="returned_for_more_info">Returned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Request type</Label>
            <Select value={filters.request_type || "all"} onValueChange={(value) => setFilters((current) => ({ ...current, request_type: value === "all" ? "" : value, page: 1 }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="email_update">Email update</SelectItem>
                <SelectItem value="kyc_update">KYC update</SelectItem>
                <SelectItem value="profile_update">Profile update</SelectItem>
                <SelectItem value="document_update">Document update</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Requested by</Label><Input className="mt-1" value={filters.user_id} onChange={(event) => setFilters((current) => ({ ...current, user_id: event.target.value, page: 1 }))} placeholder="User ID" /></div>
          <div><Label>Date from</Label><Input className="mt-1" type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value, page: 1 }))} /></div>
          <div><Label>Date to</Label><Input className="mt-1" type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value, page: 1 }))} /></div>
        </div>
        <DataTable
          compact
          loading={query.isLoading}
          rows={query.data?.data ?? []}
          pagination={query.data?.pagination}
          onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          getRowId={(row) => row.id}
          emptyTitle="No profile update requests found."
          onRowClick={setSelected}
          columns={[
            { key: "created_at", header: "Requested at" },
            { key: "request_type", header: "Type", cell: (row) => requestTypeLabel(row.request_type) },
            { key: "user_id", header: "Requested by" },
            { key: "reason", header: "Reason" },
            { key: "status", header: "Status", cell: (row) => <Badge variant="outline">{row.status}</Badge> },
            { key: "reviewed_by", header: "Reviewer" },
            { key: "reviewed_at", header: "Reviewed at" },
          ]}
          rowActions={(row) => <Button variant="outline" size="sm" onClick={() => setSelected(row)}>View</Button>}
        />
      </div>
      <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) close(); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected ? requestTypeLabel(selected.request_type) : "Profile update request"}</SheetTitle>
            <SheetDescription>Review changed fields before approving or rejecting the request.</SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 rounded-lg border p-4 text-sm">
                <div><span className="font-medium">Requested by:</span> {selected.user_id}</div>
                <div><span className="font-medium">Requested at:</span> {selected.created_at}</div>
                <div><span className="font-medium">Status:</span> {selected.status}</div>
                <div><span className="font-medium">Reason:</span> {selected.reason ?? "Not provided"}</div>
              </div>
              <div className="rounded-lg border">
                {changes.map((change) => (
                  <div key={change.label} className="grid grid-cols-2 gap-3 border-b p-3 text-sm last:border-b-0">
                    <span className="font-medium capitalize">{change.label}</span>
                    <span className="break-words">{change.value}</span>
                  </div>
                ))}
              </div>
              {selected.status === "pending" ? (
                <div className="space-y-3">
                  <Label htmlFor="review-reason">Review reason/comment</Label>
                  <Textarea id="review-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for approval or rejection." />
                  <div className="flex gap-2">
                    <Button onClick={() => approve.mutate(selected)} disabled={reason.trim().length < 3 || approve.isPending}>Approve</Button>
                    <Button variant="destructive" onClick={() => reject.mutate(selected)} disabled={reason.trim().length < 3 || reject.isPending}>Reject</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
};
