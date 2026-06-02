import { EmptyState } from "@/components/data/EmptyState";

export const ApprovalSettingsSummaryPanel = ({ data }: { data?: Record<string, unknown> }) => {
  if (!data) return <EmptyState title="Approval settings summary unavailable" description="The backend settings summary will appear here when available for your permissions." />;
  return <pre className="overflow-auto rounded-lg border bg-card p-4 text-sm">{JSON.stringify(data, null, 2)}</pre>;
};
