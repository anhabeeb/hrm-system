import { DocumentsTable } from "./DocumentsTable";
import type { DocumentRecord } from "./documents.types";
import type { Pagination } from "@/types/api";

export const ExpiringDocumentsTable = (props: { rows: DocumentRecord[]; loading?: boolean; pagination?: Pagination; canViewSensitive?: boolean; canDownload?: boolean; onView: (row: DocumentRecord) => void; onDownload: (row: DocumentRecord) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: number) => void }) => (
  <DocumentsTable {...props} canEdit={false} canDelete={false} onUpdate={() => undefined} onDelete={() => undefined} />
);
