import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { History, Upload } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { DetailDrawer } from "@/components/data/DetailDrawer";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { DocumentUploadDialog } from "@/features/documents/DocumentUploadDialog";
import { documentTypeOptions, drivingLicenseCategoryOptions } from "@/features/documents/document-format";
import type { DocumentUploadPayload } from "@/features/documents/documents.types";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { displayDate } from "./employee-format";
import { employeesApi } from "./employees.api";
import type { EmployeeDocumentCompliance, EmployeeDocumentRow } from "./employees.types";

const labelFor = (value?: string | null, options = documentTypeOptions) =>
  options.find((option) => option.value === value)?.label ?? value?.replace(/_/g, " ") ?? "-";

const sanitizeDocumentRow = (row: EmployeeDocumentRow & Record<string, unknown>, canViewSensitive: boolean): EmployeeDocumentRow => {
  const {
    file_key: _fileKey,
    storage_path: _storagePath,
    bucket_path: _bucketPath,
    private_object_key: _privateObjectKey,
    ...safe
  } = row;

  if ((safe.is_sensitive === 1 || safe.is_sensitive === true) && !canViewSensitive) {
    safe.file_name = "Sensitive document";
  }

  return safe;
};

const complianceMessage = (compliance?: EmployeeDocumentCompliance) => {
  if (!compliance) return null;
  if (compliance.status === "complete") return "Document compliance is complete.";
  if (compliance.status === "missing_optional_documents") return "Some optional employee documents are missing.";
  if (compliance.status === "expired_documents") return "One or more employee documents are expired.";
  if (compliance.status === "expiring_soon") return "One or more employee documents are expiring soon.";
  if (compliance.status === "needs_review") return "Some employee documents need review.";
  return "Document compliance loaded.";
};

export const EmployeeDocumentsPanel = ({
  employeeId,
  canViewDocuments,
  canViewSensitiveDocuments,
  canUploadDocuments,
  canEditDocuments,
}: {
  employeeId: string;
  canViewDocuments: boolean;
  canViewSensitiveDocuments: boolean;
  canUploadDocuments?: boolean;
  canEditDocuments?: boolean;
}) => {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selected, setSelected] = useState<EmployeeDocumentRow | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => employeesApi.documents(employeeId),
    enabled: canViewDocuments,
  });
  const historyQuery = useQuery({
    queryKey: ["employee-documents", employeeId, selected?.id, "history"],
    queryFn: () => employeesApi.documentHistory(employeeId, selected!.id),
    enabled: historyOpen && Boolean(selected?.id),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
  const uploadMutation = useMutation({
    mutationFn: (payload: Omit<DocumentUploadPayload, "employee_id">) => employeesApi.uploadDocument(employeeId, payload),
    onSuccess: async () => {
      setSuccess("Employee document uploaded successfully.");
      setUploadOpen(false);
      await refresh();
    },
  });
  const replaceMutation = useMutation({
    mutationFn: (payload: Omit<DocumentUploadPayload, "employee_id"> & { reason: string }) => employeesApi.replaceDocument(employeeId, selected!.id, payload),
    onSuccess: async () => {
      setSuccess("Employee document replaced successfully.");
      setReplaceOpen(false);
      await refresh();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => employeesApi.archiveDocument(employeeId, id, reason),
    onSuccess: async () => {
      setSuccess("Employee document archived successfully.");
      await refresh();
    },
  });

  if (!canViewDocuments) return null;

  if (query.isError) {
    return <InlineAlert title="Document summary could not be loaded." variant="warning">Document access may require additional permission.</InlineAlert>;
  }

  const documents = (query.data?.data.documents ?? []).map((row) => sanitizeDocumentRow(row as EmployeeDocumentRow & Record<string, unknown>, canViewSensitiveDocuments));
  const compliance = query.data?.data.compliance;
  const message = complianceMessage(compliance);
  const error = uploadMutation.error ?? replaceMutation.error ?? archiveMutation.error;

  return (
    <div className="space-y-3">
      {message ? <InlineAlert title={message} variant={compliance?.status === "complete" ? "success" : "warning"}>{compliance?.warning}</InlineAlert> : null}
      {success ? <InlineAlert title={success} variant="success" /> : null}
      {error ? <InlineAlert title={friendlyHrmError(error, "Document action could not be completed.")} variant="error" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Expected: {(compliance?.expected_document_types ?? []).map((type) => labelFor(type)).join(", ") || "Not configured"}
        </div>
        {canUploadDocuments ? <Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" />Upload document</Button> : null}
      </div>
      <DataTable
        compact
        loading={query.isLoading}
        columns={[
          { key: "document_type", header: "Type", cell: (row) => labelFor(row.document_type) },
          { key: "document_number", header: "Number", cell: (row) => row.document_number ?? "-" },
          { key: "start_date", header: "Start date", cell: (row) => displayDate(row.start_date ?? row.issue_date) },
          { key: "expiry_date", header: "Expiry date", cell: (row) => displayDate(row.expiry_date) },
          { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.validity_status ?? row.status ?? "neutral"} /> },
          { key: "version_number", header: "Version", cell: (row) => `v${row.version_number ?? 1}` },
        ]}
        rows={documents}
        getRowId={(row) => row.id}
        emptyTitle="No documents found."
        rowActions={(row) => (
          <RowActions
            actions={[
              { key: "view", label: "View history", onSelect: () => { setSelected(row); setHistoryOpen(true); } },
              ...(canUploadDocuments ? [{ key: "edit" as const, label: "Replace document", onSelect: () => { setSelected(row); setReplaceOpen(true); } }] : []),
              ...(canEditDocuments ? [{ key: "archive" as const, label: "Archive document", onSelect: () => {
                const reason = window.prompt("Reason for archiving this document");
                if (reason && reason.trim().length >= 3) archiveMutation.mutate({ id: row.id, reason });
              } }] : []),
            ]}
          />
        )}
      />
      <DocumentUploadDialog
        employeeId={employeeId}
        open={uploadOpen}
        loading={uploadMutation.isPending}
        error={uploadMutation.error ? friendlyHrmError(uploadMutation.error, "Document could not be uploaded.") : null}
        onOpenChange={setUploadOpen}
        onSubmit={(payload) => uploadMutation.mutate(payload)}
      />
      <DocumentUploadDialog
        employeeId={employeeId}
        mode="replace"
        open={replaceOpen}
        loading={replaceMutation.isPending}
        error={replaceMutation.error ? friendlyHrmError(replaceMutation.error, "Document could not be replaced.") : null}
        onOpenChange={setReplaceOpen}
        onSubmit={(payload) => replaceMutation.mutate({ ...payload, reason: payload.reason ?? "" })}
      />
      <DetailDrawer open={historyOpen} onOpenChange={setHistoryOpen} title="Document history" subtitle={selected ? labelFor(selected.document_type) : undefined}>
        <DataTable
          compact
          loading={historyQuery.isLoading}
          rows={(historyQuery.data?.data.history ?? []).map((row) => sanitizeDocumentRow(row as EmployeeDocumentRow & Record<string, unknown>, canViewSensitiveDocuments))}
          getRowId={(row) => row.id}
          columns={[
            { key: "version_number", header: "Version", cell: (row) => `v${row.version_number ?? 1}` },
            { key: "document_number", header: "Number", cell: (row) => row.document_number ?? "-" },
            { key: "start_date", header: "Start date", cell: (row) => displayDate(row.start_date ?? row.issue_date) },
            { key: "expiry_date", header: "Expiry date", cell: (row) => displayDate(row.expiry_date) },
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.validity_status ?? row.status ?? "neutral"} /> },
            { key: "driving_license_category", header: "License class", cell: (row) => labelFor(row.driving_license_category, drivingLicenseCategoryOptions) },
            { key: "notes", header: "Notes", cell: (row) => row.notes ?? "-" },
          ]}
          emptyTitle="No document history found."
        />
      </DetailDrawer>
    </div>
  );
};
