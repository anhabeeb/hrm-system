import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { RowActions, type RowAction } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import { assetHolder, assetValue } from "./asset-format";
import type { AssetRecord } from "./assets.types";

const columns: TableColumn<AssetRecord>[] = [
  { key: "asset_code", header: "Asset Code" },
  { key: "asset_name", header: "Asset Name" },
  { key: "asset_type", header: "Type" },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Unassigned" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "neutral"} /> },
  { key: "assigned_employee_name", header: "Assigned To", cell: assetHolder },
  { key: "purchase_value_amount", header: "Value", cell: (row) => <MoneyAmount amount={assetValue(row)} /> },
  { key: "purchase_date", header: "Purchase Date", cell: (row) => formatDate(row.purchase_date) },
];

export const AssetsTable = ({
  rows,
  loading,
  pagination,
  canEdit,
  canAssign,
  canReturn,
  canMarkLost,
  canMarkDamaged,
  canRequestDeduction,
  onView,
  onEdit,
  onAssign,
  onReturn,
  onMarkLost,
  onMarkDamaged,
  onRequestDeduction,
  onPageChange,
  onPageSizeChange,
}: {
  rows: AssetRecord[];
  loading?: boolean;
  pagination?: Pagination;
  canEdit?: boolean;
  canAssign?: boolean;
  canReturn?: boolean;
  canMarkLost?: boolean;
  canMarkDamaged?: boolean;
  canRequestDeduction?: boolean;
  onView: (row: AssetRecord) => void;
  onEdit: (row: AssetRecord) => void;
  onAssign: (row: AssetRecord) => void;
  onReturn: (row: AssetRecord) => void;
  onMarkLost: (row: AssetRecord) => void;
  onMarkDamaged: (row: AssetRecord) => void;
  onRequestDeduction: (row: AssetRecord) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) => (
  <DataTable
    columns={columns}
    rows={rows}
    getRowId={(row) => row.id}
    loading={loading}
    pagination={pagination}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
    onRowClick={onView}
    emptyTitle="No assets"
    emptyDescription="Assets will appear here once created or assigned."
    rowActions={(row) => {
      const actions: RowAction[] = [{ key: "view", onSelect: () => onView(row) }];
      if (canEdit) actions.push({ key: "edit", onSelect: () => onEdit(row) });
      if (canAssign) actions.push({ key: "assign-role", label: "Assign", onSelect: () => onAssign(row) });
      if (canReturn) actions.push({ key: "more", label: "Return", onSelect: () => onReturn(row) });
      if (canMarkLost) actions.push({ key: "disable", label: "Mark lost", onSelect: () => onMarkLost(row) });
      if (canMarkDamaged) actions.push({ key: "disable", label: "Mark damaged", onSelect: () => onMarkDamaged(row) });
      if (canRequestDeduction) actions.push({ key: "more", label: "Request deduction", onSelect: () => onRequestDeduction(row) });
      return <RowActions actions={actions} />;
    }}
  />
);
