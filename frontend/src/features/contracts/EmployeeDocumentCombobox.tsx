import { LookupCombobox } from "@/components/selectors/LookupCombobox";
import type { LookupFilters, LookupOption } from "@/components/selectors/lookup-api";
import { displayDate } from "@/features/employees/employee-format";
import { documentTypeLabel } from "@/features/documents/document-format";
import { documentsApi } from "@/features/documents/documents.api";
import type { DocumentRecord } from "@/features/documents/documents.types";

const contractDocumentTypes = new Set(["employment_contract", "contract_renewal", "contract_amendment"]);

const documentLabel = (document: DocumentRecord) => {
  const parts = [
    document.file_name ?? document.id,
    documentTypeLabel(document),
    document.status ? `Status: ${document.status.replace(/_/g, " ")}` : null,
    document.expiry_date ? `Expires: ${displayDate(document.expiry_date)}` : null,
  ].filter(Boolean);
  return parts.join(" - ");
};

const toOption = (document: DocumentRecord): LookupOption => ({
  id: document.id,
  name: document.file_name ?? document.id,
  label: documentLabel(document),
  status: document.status,
});

export const EmployeeDocumentCombobox = ({
  employeeId,
  value,
  onChange,
  disabled,
}: {
  employeeId?: string;
  value?: string | null;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}) => (
  <LookupCombobox
    value={value}
    onChange={onChange}
    disabled={disabled || !employeeId}
    queryKey={["employee-contract-documents", employeeId]}
    queryFn={async (filters: LookupFilters) => {
      const response = await documentsApi.list({ employee_id: employeeId, page_size: 100 });
      const search = filters.search?.trim().toLowerCase();
      const rows = response.data
        .filter((document) => {
          if (!search) return true;
          return documentLabel(document).toLowerCase().includes(search);
        })
        .sort((a, b) => {
          const aContract = contractDocumentTypes.has(String(a.document_type));
          const bContract = contractDocumentTypes.has(String(b.document_type));
          if (aContract !== bContract) return aContract ? -1 : 1;
          return documentLabel(a).localeCompare(documentLabel(b));
        });
      return { data: rows.map(toOption), pagination: response.pagination };
    }}
    placeholder="Select contract document"
    searchPlaceholder="Search document file name or type..."
    emptyText="Upload the contract document in Employee Documents first, then select it here."
    loadingText="Loading employee documents..."
  />
);
