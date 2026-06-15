import { DataTable } from "@/components/data/DataTable";
import { yesNo } from "./OperationOwnershipShared";
import type { OperationCatalogEntry } from "./operation-ownership.types";

export const OperationCatalogTable = ({ rows, loading }: { rows: OperationCatalogEntry[]; loading?: boolean }) => (
  <DataTable
    compact
    loading={loading}
    rows={rows}
    getRowId={(row) => row.id}
    emptyTitle="No operation catalog entries found."
    columns={[
      { key: "operation_code", header: "Operation" },
      { key: "operation_name", header: "Name" },
      { key: "module_key", header: "Module" },
      { key: "default_business_function_code", header: "Default function", cell: (row) => row.default_business_function_code ?? "Not set" },
      { key: "responsibility_count", header: "Responsibilities", cell: (row) => row.responsibility_count ?? 0 },
      { key: "is_sensitive", header: "Sensitive", cell: (row) => yesNo(row.is_sensitive) },
    ]}
  />
);
