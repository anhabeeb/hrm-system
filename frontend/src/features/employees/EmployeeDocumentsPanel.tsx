import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { StatusBadge } from "@/components/data/StatusBadge";
import { displayDate } from "./employee-format";
import { employeesApi } from "./employees.api";
import type { EmployeeDocumentRow } from "./employees.types";

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

export const EmployeeDocumentsPanel = ({ employeeId, canViewDocuments, canViewSensitiveDocuments }: { employeeId: string; canViewDocuments: boolean; canViewSensitiveDocuments: boolean }) => {
  const query = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => employeesApi.documents(employeeId),
    enabled: canViewDocuments,
  });

  if (!canViewDocuments) return null;

  if (query.isError) {
    return <InlineAlert title="Document summary could not be loaded." variant="warning">Document access may require additional permission.</InlineAlert>;
  }

  return (
    <DataTable
      compact
      loading={query.isLoading}
      columns={[
        { key: "document_type", header: "Document" },
        { key: "file_name", header: "File" },
        { key: "expiry_date", header: "Expiry", cell: (row) => displayDate(row.expiry_date) },
        { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "neutral"} /> },
      ]}
      rows={(query.data?.data.documents ?? []).map((row) => sanitizeDocumentRow(row as EmployeeDocumentRow & Record<string, unknown>, canViewSensitiveDocuments))}
      getRowId={(row) => row.id}
      emptyTitle="No documents found."
    />
  );
};
