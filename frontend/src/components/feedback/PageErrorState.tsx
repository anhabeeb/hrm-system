import { Button } from "@/components/ui/button";
import type { ApiError } from "@/lib/api-errors";

import { AppErrorAlert } from "./AppErrorAlert";

export const PageErrorState = ({
  error,
  title = "This page could not be loaded",
  onRetry,
}: {
  error?: ApiError | Error | null;
  title?: string;
  onRetry?: () => void;
}) => (
  <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col justify-center gap-4 px-6">
    <AppErrorAlert error={error ?? null} fallbackTitle={title} onRetry={onRetry} />
    {!error ? <p className="text-sm text-muted-foreground">{title}</p> : null}
    {onRetry ? (
      <Button type="button" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    ) : null}
  </div>
);
