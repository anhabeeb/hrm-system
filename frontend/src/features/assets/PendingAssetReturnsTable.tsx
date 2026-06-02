import { AssetsTable } from "./AssetsTable";
import type { AssetRecord } from "./assets.types";
import type { Pagination } from "@/types/api";

export const PendingAssetReturnsTable = (props: {
  rows: AssetRecord[];
  loading?: boolean;
  pagination?: Pagination;
  canReturn?: boolean;
  canMarkLost?: boolean;
  canMarkDamaged?: boolean;
  onView: (row: AssetRecord) => void;
  onReturn: (row: AssetRecord) => void;
  onMarkLost: (row: AssetRecord) => void;
  onMarkDamaged: (row: AssetRecord) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) => (
  <AssetsTable
    {...props}
    canEdit={false}
    canAssign={false}
    canRequestDeduction={false}
    onEdit={() => undefined}
    onAssign={() => undefined}
    onRequestDeduction={() => undefined}
  />
);
