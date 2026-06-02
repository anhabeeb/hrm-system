import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime } from "@/lib/safe-display";
import type { SyncStatusSummary } from "./sync.types";

export const SyncSummaryPanel = ({ summary }: { summary?: SyncStatusSummary }) => (
  <div className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm md:grid-cols-5">
    {[
      ["Pending items", summary?.pending_count ?? 0],
      ["Failed items", summary?.failed_count ?? 0],
      ["Conflicts pending", summary?.conflict_count ?? 0],
      ["Latest token", summary?.last_sync_token ?? 0],
      ["Warnings", summary?.devices_warning_count ?? 0],
    ].map(([label, value]) => (
      <div key={label} className="rounded-md border bg-background p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </div>
    ))}
    <div className="md:col-span-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
      <span>Last push: {formatDateTime(summary?.last_push_at)}</span>
      <span>Last pull: {formatDateTime(summary?.last_pull_at)}</span>
      <span>Online devices: <StatusBadge status={summary?.devices_online_count ? "active" : "neutral"} /></span>
    </div>
  </div>
);
