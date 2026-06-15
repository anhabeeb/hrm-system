import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/data/EmptyState";
import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { RosterChangeRequestDialog } from "@/features/rosters/RosterChangeRequestDialog";
import { friendlyOperationalError } from "@/lib/safe-display";
import { selfServiceApi } from "./self-service.api";

export const SelfServiceModulePage = ({ moduleKey }: { moduleKey: string }) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [rosterChangeOpen, setRosterChangeOpen] = useState(false);
  const query = useQuery({ queryKey: ["self-service", "navigation"], queryFn: selfServiceApi.navigation });
  const item = query.data?.data.find((entry) => entry.key === moduleKey);
  const canRequestRosterChange = moduleKey === "roster" && Boolean(item?.enabled);
  return (
    <div className="space-y-4 p-4 md:p-6">
      {query.isLoading ? <LoadingState rows={4} /> : null}
      {query.isError ? <InlineAlert title={friendlyOperationalError(query.error, "Self-service module status could not be loaded.")} variant="error" /> : null}
      <div className="overflow-hidden rounded-lg border bg-card">
        <EmptyState
          title={item?.enabled ? `${item.label} self-service foundation` : item?.reason ?? "This self-service module is not available."}
          description={item?.enabled ? "Detailed self-service screens will build from this foundation. Your dashboard already shows the safe summary for this module." : "Only enabled modules with matching permissions appear as active self-service pages."}
          actionLabel={canRequestRosterChange ? "Request roster change" : "Back to dashboard"}
          onAction={canRequestRosterChange ? () => setRosterChangeOpen(true) : () => undefined}
        />
      </div>
      <Button asChild variant="outline" size="sm"><Link to="/self/dashboard">Back to dashboard</Link></Button>
      <RosterChangeRequestDialog
        open={rosterChangeOpen}
        onOpenChange={setRosterChangeOpen}
        currentEmployeeId={auth.user?.employee_id ?? null}
        canSelectEmployee={false}
        onSubmitted={async () => {
          await queryClient.invalidateQueries({ queryKey: ["self-service"] });
        }}
      />
    </div>
  );
};
