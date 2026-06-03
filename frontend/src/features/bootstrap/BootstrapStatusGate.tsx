import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
<<<<<<< HEAD
=======
import { useState } from "react";
>>>>>>> 79432d0 (Initial HRM system source)
import { Navigate, useLocation } from "react-router-dom";

import { LoadingState } from "@/components/data/LoadingState";
import { AppErrorAlert } from "@/components/feedback/AppErrorAlert";
<<<<<<< HEAD
=======
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-errors";
>>>>>>> 79432d0 (Initial HRM system source)

import { bootstrapApi } from "./bootstrap.api";

export const BootstrapStatusGate = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
<<<<<<< HEAD
=======
  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<ApiError | null>(null);
>>>>>>> 79432d0 (Initial HRM system source)
  const statusQuery = useQuery({
    queryKey: ["bootstrap-status"],
    queryFn: () => bootstrapApi.status(),
    retry: 1,
  });

<<<<<<< HEAD
=======
  const checkHealth = async () => {
    setHealthResult(null);
    setHealthError(null);
    try {
      const result = await bootstrapApi.health();
      setHealthResult(`API health is ${result.data.status}. Service: ${result.data.service}. Version: ${result.data.version}.`);
    } catch (error) {
      if (error instanceof ApiError) {
        setHealthError(error);
      } else {
        setHealthError(new ApiError("API health check failed.", {
          code: "HEALTH_CHECK_FAILED",
          title: "Health check failed",
          status: 0,
          retryable: true,
        }));
      }
    }
  };

>>>>>>> 79432d0 (Initial HRM system source)
  if (statusQuery.isLoading) {
    return <LoadingState rows={6} />;
  }

  if (statusQuery.isError) {
<<<<<<< HEAD
    return (
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-6">
        <AppErrorAlert
          error={statusQuery.error instanceof Error ? statusQuery.error : null}
=======
    const statusError = statusQuery.error instanceof Error ? statusQuery.error : null;
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6">
        <div className="w-full space-y-4">
        <AppErrorAlert
          error={statusError}
>>>>>>> 79432d0 (Initial HRM system source)
          fallbackTitle="Unable to check setup status"
          fallbackMessage="You can still try refreshing the page. If this continues, please contact your administrator."
          onRetry={() => void statusQuery.refetch()}
        />
<<<<<<< HEAD
=======
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void statusQuery.refetch()}>
              Retry setup check
            </Button>
            <Button type="button" variant="outline" onClick={() => void checkHealth()}>
              Check API health
            </Button>
          </div>
          {healthResult ? <InlineAlert title="API health check completed" variant="success">{healthResult}</InlineAlert> : null}
          {healthError ? <AppErrorAlert error={healthError} fallbackTitle="API health check failed" /> : null}
        </div>
>>>>>>> 79432d0 (Initial HRM system source)
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
