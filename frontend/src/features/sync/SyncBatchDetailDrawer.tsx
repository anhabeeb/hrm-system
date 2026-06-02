import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, sanitizeForDisplay } from "@/lib/safe-display";
import type { SyncBatch, SyncConflict } from "./sync.types";

export const SyncBatchDetailDrawer = ({ record, open, onOpenChange }: { record: SyncBatch | SyncConflict | null; open: boolean; onOpenChange: (open: boolean) => void }) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title="Sync detail" subtitle={record?.id}>
    {record ? (
      <>
        <DetailSection
          title="Status"
          rows={[
            { label: "Status", value: <StatusBadge status={"status" in record ? record.status : "neutral"} /> },
            { label: "Device", value: ("device_name" in record && record.device_name) || ("device_id" in record && record.device_id) || "Not recorded" },
            { label: "Outlet", value: ("outlet_name" in record && record.outlet_name) || ("outlet_id" in record && record.outlet_id) || "Not recorded" },
            { label: "Created", value: formatDateTime("created_at" in record ? record.created_at : undefined) },
          ]}
        />
        <DetailSection title="Sanitized Payload" rows={[{ label: "Data", value: <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(record), null, 2)}</pre> }]} />
      </>
    ) : null}
  </DetailDrawer>
);
