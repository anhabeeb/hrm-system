import { useQuery } from "@tanstack/react-query";

import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { friendlyOperationalError } from "@/lib/safe-display";
import { selfServiceApi } from "./self-service.api";
import { NotLinkedEmployeeState, RequestsTable, WidgetCard } from "./SelfServiceShared";

export const EmployeeDashboardPage = () => {
  const query = useQuery({ queryKey: ["self-service", "dashboard"], queryFn: selfServiceApi.dashboard });
  const dashboard = query.data?.data;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {query.isLoading ? <LoadingState rows={8} /> : null}
      {query.isError ? <InlineAlert title={friendlyOperationalError(query.error, "Employee dashboard could not be loaded.")} variant="error" /> : null}
      {dashboard && !dashboard.profile.linked_employee ? <NotLinkedEmployeeState /> : null}
      {dashboard ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.widgets.map((widget) => <WidgetCard key={widget.key} widget={widget} />)}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <RequestsTable rows={dashboard.requests} emptyTitle="No recent requests." />
            <RequestsTable rows={dashboard.pending_approvals} emptyTitle="No pending approvals assigned to you." />
          </div>
        </>
      ) : null}
    </div>
  );
};
