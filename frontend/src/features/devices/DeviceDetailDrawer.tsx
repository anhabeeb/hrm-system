import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize, sanitizeForDisplay } from "@/lib/safe-display";
import type { DeviceRecord } from "./devices.types";

export const DeviceDetailDrawer = ({ device, open, onOpenChange }: { device: DeviceRecord | null; open: boolean; onOpenChange: (open: boolean) => void }) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title="Device detail" subtitle={device?.device_name ?? device?.id}>
    {device ? (
      <>
        <DetailSection
          title="Device"
          rows={[
            { label: "Name", value: device.device_name ?? device.name ?? device.id },
            { label: "Type", value: humanize(device.device_type) },
            { label: "Outlet", value: device.outlet_name ?? device.outlet_id ?? "Not recorded" },
            { label: "Status", value: <StatusBadge status={device.status} /> },
          ]}
        />
        <DetailSection
          title="Health and Sync"
          rows={[
            { label: "Last seen", value: formatDateTime(device.last_seen_at) },
            { label: "Last sync", value: formatDateTime(device.last_sync_at) },
            { label: "Health", value: <StatusBadge status={device.health_status ?? "neutral"} /> },
            { label: "Pending", value: device.pending_count ?? 0 },
            { label: "Failed", value: device.failed_count ?? 0 },
          ]}
        />
        <DetailSection title="Sanitized Payload" rows={[{ label: "Data", value: <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(device), null, 2)}</pre> }]} />
      </>
    ) : null}
  </DetailDrawer>
);
