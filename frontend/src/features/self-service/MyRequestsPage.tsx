import { useQuery } from "@tanstack/react-query";

import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { friendlyOperationalError } from "@/lib/safe-display";
import { selfServiceApi } from "./self-service.api";
import { RequestsTable } from "./SelfServiceShared";

export const MyRequestsPage = () => {
  const query = useQuery({ queryKey: ["self-service", "requests"], queryFn: selfServiceApi.requests });
  return (
    <div className="space-y-4 p-4 md:p-6">
      {query.isLoading ? <LoadingState rows={6} /> : null}
      {query.isError ? <InlineAlert title={friendlyOperationalError(query.error, "My requests could not be loaded.")} variant="error" /> : null}
      <RequestsTable rows={query.data?.data ?? []} loading={query.isLoading} />
    </div>
  );
};
