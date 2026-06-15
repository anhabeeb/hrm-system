import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { formatDate } from "@/lib/safe-display";
import { DocumentDetailDrawer } from "./DocumentDetailDrawer";
import { DocumentKycDetailDrawer } from "./DocumentKycDetailDrawer";
import { DocumentKycRequestDialog } from "./DocumentKycRequestDialog";
import { DocumentKycRequestsTable } from "./DocumentKycRequestsTable";
import { documentsApi } from "./documents.api";
import { documentName, documentTypeLabel } from "./document-format";
import type { DocumentKycRequestPayload, DocumentKycRequestRecord, DocumentRecord } from "./documents.types";

const terminalKycStatuses = new Set(["APPLIED", "REJECTED", "CANCELLED", "FAILED_TO_APPLY"]);

export const MyDocumentsKycPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<DocumentKycRequestRecord | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [documentDrawerOpen, setDocumentDrawerOpen] = useState(false);
  const documentsQuery = useQuery({ queryKey: ["documents", "my-documents"], queryFn: () => documentsApi.list({ page: 1, page_size: 25 }), enabled: Boolean(auth.user?.employee_id) });
  const query = useQuery({ queryKey: ["documents", "my-kyc-requests"], queryFn: () => documentsApi.listKycRequests({ page: 1, page_size: 25 }) });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["documents"] });
  const mutation = useMutation({
    mutationFn: async (payload: DocumentKycRequestPayload) => {
      const created = await documentsApi.createKycRequest(payload);
      return documentsApi.submitKycRequest(created.data.document_kyc_request.id);
    },
    onSuccess: async () => { toastSuccess(toast, "Your document/KYC request has been submitted for approval."); setDialogOpen(false); await refresh(); },
    onError: (error) => toastError(toast, error, "Document/KYC request could not be submitted."),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => documentsApi.cancelKycRequest(id, reason),
    onSuccess: async () => { toastSuccess(toast, "Document/KYC request cancelled."); await refresh(); },
    onError: (error) => toastError(toast, error, "Document/KYC request could not be cancelled."),
  });
  const downloadMutation = useMutation({
    mutationFn: async (document: DocumentRecord) => ({ document, blob: await documentsApi.download(document.id) }),
    onSuccess: ({ document, blob }) => {
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = documentName(document, true) || "employee-document";
      link.click();
      window.URL.revokeObjectURL(url);
      toastSuccess(toast, "Document downloaded successfully.");
    },
    onError: (error) => toastError(toast, error, "Document could not be downloaded."),
  });
  const canCreate = auth.isSuperAdmin || auth.hasPermission("documentKyc.requests.create");
  const kycRows = query.data?.data ?? [];
  const pendingByDocumentType = new Map(
    kycRows
      .filter((row) => row.document_type && !terminalKycStatuses.has(row.status))
      .map((row) => [row.document_type, row.status]),
  );
  return (
    <div>
      {canCreate ? <PageActionBar label="My documents and KYC actions"><Button onClick={() => setDialogOpen(true)}>Request document/KYC update</Button></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        {!auth.user?.employee_id ? (
          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Your employee profile is not linked to this login. Please contact HR.</div>
        ) : null}
        <section className="space-y-2">
          <div>
            <h2 className="text-base font-semibold">My Documents</h2>
            <p className="text-sm text-muted-foreground">Official document records linked to your employee profile.</p>
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Issue date</TableHead>
                  <TableHead>Expiry date</TableHead>
                  <TableHead>Pending update</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentsQuery.isLoading ? <TableRow><TableCell colSpan={7} className="text-muted-foreground">Loading your documents...</TableCell></TableRow> : null}
                {!documentsQuery.isLoading && (documentsQuery.data?.data ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="text-muted-foreground">No documents are available for your account.</TableCell></TableRow> : null}
                {(documentsQuery.data?.data ?? []).map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>{documentTypeLabel(document)}</TableCell>
                    <TableCell><StatusBadge status={document.validity_status ?? document.status ?? "active"} /></TableCell>
                    <TableCell><StatusBadge status={(document.verification_status as string | undefined) ?? "recorded"} /></TableCell>
                    <TableCell>{formatDate(document.issue_date ?? document.start_date)}</TableCell>
                    <TableCell>{formatDate(document.expiry_date)}</TableCell>
                    <TableCell>{pendingByDocumentType.get(document.document_type ?? "") ? <StatusBadge status={pendingByDocumentType.get(document.document_type ?? "")!} /> : "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedDocument(document); setDocumentDrawerOpen(true); }}>View</Button>
                        {document.has_file ? (
                          <Button variant="ghost" size="sm" onClick={() => downloadMutation.mutate(document)}>Download</Button>
                        ) : (
                          <span className="self-center text-xs text-muted-foreground">No file attached.</span>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>Request update</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        <section className="space-y-2">
          <div>
            <h2 className="text-base font-semibold">My KYC / Update Requests</h2>
            <p className="text-sm text-muted-foreground">Requests submitted by you or created on your behalf.</p>
          </div>
        {query.error ? <p className="sr-only">{friendlyHrmError(query.error, "Document/KYC requests could not be loaded.")}</p> : null}
        <DocumentKycRequestsTable
          rows={kycRows}
          loading={query.isLoading}
          canCancel={auth.isSuperAdmin || auth.hasPermission("documentKyc.requests.cancel")}
          onView={(row) => { setSelected(row); setDrawerOpen(true); }}
          onCancel={(row) => cancelMutation.mutate({ id: row.id, reason: "Cancelled from self-service." })}
        />
        </section>
      </div>
      <DocumentKycRequestDialog open={dialogOpen} loading={mutation.isPending} error={mutation.error ? friendlyHrmError(mutation.error, "Document/KYC request could not be submitted.") : null} currentEmployeeId={auth.user?.employee_id ?? null} canSelectEmployee={false} onOpenChange={setDialogOpen} onSubmit={(payload) => mutation.mutate(payload)} />
      <DocumentKycDetailDrawer request={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <DocumentDetailDrawer document={selectedDocument} canViewSensitive open={documentDrawerOpen} onOpenChange={setDocumentDrawerOpen} />
    </div>
  );
};
