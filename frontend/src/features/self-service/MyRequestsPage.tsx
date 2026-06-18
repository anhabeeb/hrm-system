import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { friendlyOperationalError } from "@/lib/safe-display";
import { selfServiceApi } from "./self-service.api";
import { SelfServiceApprovalChainDialog } from "./SelfServiceApprovalChainDialog";
import { RequestsTable } from "./SelfServiceShared";
import type { SelfRequest } from "./self-service.types";

export const MyRequestsPage = () => {
  const [selectedRequest, setSelectedRequest] = useState<SelfRequest | null>(null);
  const query = useQuery({ queryKey: ["self-service", "requests"], queryFn: selfServiceApi.requests });
  const approvalChainQuery = useQuery({
    queryKey: ["self-service", "approval-chain", selectedRequest?.id],
    queryFn: () => selfServiceApi.approvalChain(selectedRequest!.id),
    enabled: Boolean(selectedRequest?.id),
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      {query.isLoading ? <LoadingState rows={6} /> : null}
      {query.isError ? <InlineAlert title={friendlyOperationalError(query.error, "My requests could not be loaded.")} variant="error" /> : null}
      <RequestsTable rows={query.data?.data ?? []} loading={query.isLoading} onViewApprovalChain={setSelectedRequest} />
      <SelfServiceApprovalChainDialog
        request={selectedRequest}
        open={Boolean(selectedRequest)}
        loading={approvalChainQuery.isLoading}
        error={approvalChainQuery.isError ? friendlyOperationalError(approvalChainQuery.error, "Approval progress could not be loaded.") : null}
        chain={approvalChainQuery.data?.data ?? null}
        onOpenChange={(open) => {
          if (!open) setSelectedRequest(null);
        }}
      />
    </div>
  );
};
