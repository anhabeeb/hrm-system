import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { LoadingState } from "@/components/data/LoadingState";
import { AppErrorAlert } from "@/components/feedback/AppErrorAlert";

import { bootstrapApi } from "./bootstrap.api";

export const BootstrapStatusGate = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const statusQuery = useQuery({
    queryKey: ["bootstrap-status"],
    queryFn: () => bootstrapApi.status(),
    retry: 1,
  });

  if (statusQuery.isLoading) {
    return <LoadingState rows={6} />;
  }

  if (statusQuery.isError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-6">
        <AppErrorAlert
          error={statusQuery.error instanceof Error ? statusQuery.error : null}
          fallbackTitle="Unable to check setup status"
          fallbackMessage="You can still try refreshing the page. If this continues, please contact your administrator."
          onRetry={() => void statusQuery.refetch()}
        />
      </div>
    );
  }

  if (statusQuery.data?.data.setup_required && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  if (!statusQuery.data?.data.setup_required && location.pathname === "/setup") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
