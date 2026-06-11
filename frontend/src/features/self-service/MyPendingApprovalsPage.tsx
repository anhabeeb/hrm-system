import { useQuery } from "@tanstack/react-query";

import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { friendlyOperationalError } from "@/lib/safe-display";
import { selfServiceApi } from "./self-service.api";
import { RequestsTable } from "./SelfServiceShared";

export const MyPendingApprovalsPage = () => {
  const query = useQuery({ queryKey: ["self-service", "pending-approvals"], queryFn: selfServiceApi.pendingApprovals });
  return (
    <div className="space-y-4 p-4 md:p-6">
      {query.isLoading ? <LoadingState rows={6} /> : null}
      {query.isError ? <InlineAlert title={friendlyOperationalError(query.error, "Pending approvals could not be loaded.")} variant="error" /> : null}
      <RequestsTable rows={query.data?.data ?? []} loading={query.isLoading} emptyTitle="No pending approvals assigned to you." />
    </div>
  );
};
