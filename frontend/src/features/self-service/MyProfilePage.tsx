import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { friendlyOperationalError } from "@/lib/safe-display";
import { selfServiceApi } from "./self-service.api";
import { NotLinkedEmployeeState, ProfileSummaryTable } from "./SelfServiceShared";

export const MyProfilePage = () => {
  const query = useQuery({ queryKey: ["self-service", "profile"], queryFn: selfServiceApi.profile });
  const profile = query.data?.data;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {query.isLoading ? <LoadingState rows={5} /> : null}
      {query.isError ? <InlineAlert title={friendlyOperationalError(query.error, "My profile could not be loaded.")} variant="error" /> : null}
      {profile && !profile.linked_employee ? <NotLinkedEmployeeState /> : null}
      {profile ? (
        <>
          <ProfileSummaryTable profile={profile} />
          <div className="flex flex-wrap justify-end gap-2 rounded-lg border bg-card p-3">
            <Button asChild variant="outline" size="sm"><Link to="/profile/security">Profile / Security</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/profile/kyc-update">Request profile update</Link></Button>
          </div>
        </>
      ) : null}
    </div>
  );
};
