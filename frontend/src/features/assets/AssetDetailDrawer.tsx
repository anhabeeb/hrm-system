import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/safe-display";
import { assetHolder, assetValue } from "./asset-format";
import type { AssetRecord } from "./assets.types";

export const AssetDetailDrawer = ({ asset, open, onOpenChange }: { asset: AssetRecord | null; open: boolean; onOpenChange: (open: boolean) => void }) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={asset?.asset_name ?? "Asset"} subtitle={asset?.asset_code}>
    {asset ? (
      <>
        <DetailSection title="Asset Information" rows={[
          { label: "Code", value: asset.asset_code },
          { label: "Type", value: asset.asset_type },
          { label: "Status", value: <StatusBadge status={asset.status ?? "neutral"} /> },
          { label: "Condition", value: asset.current_condition ?? "Not set" },
          { label: "Outlet", value: asset.outlet_name ?? asset.outlet_id ?? "Unassigned" },
        ]} />
        <DetailSection title="Assignment / Value" rows={[
          { label: "Current holder", value: assetHolder(asset) },
          { label: "Issued date", value: formatDate(asset.issued_date) },
          { label: "Returned date", value: formatDate(asset.returned_date) },
          { label: "Value", value: <MoneyAmount amount={assetValue(asset)} /> },
          { label: "Created", value: formatDateTime(asset.created_at) },
        ]} />
      </>
    ) : null}
  </DetailDrawer>
);
