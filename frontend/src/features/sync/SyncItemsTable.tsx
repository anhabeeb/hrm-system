import { EmptyState } from "@/components/data/EmptyState";

export const SyncItemsTable = () => (
  <div className="rounded-lg border bg-card">
    <EmptyState title="Sync item listing is not connected yet" description="The backend has batch and conflict endpoints, but no admin sync-items list endpoint. This action stays disabled to avoid repeated 404 calls." />
  </div>
);
