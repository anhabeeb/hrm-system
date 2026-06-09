import { InlineAlert } from "@/components/feedback/InlineAlert";
import { ApiError, toDiagnosticText } from "@/lib/api-errors";

import { CopyDiagnosticsButton } from "./CopyDiagnosticsButton";
import { ErrorDetailsAccordion } from "./ErrorDetailsAccordion";

export const AppErrorAlert = ({
  error,
  fallbackTitle = "Something went wrong",
  fallbackMessage = "Please try again or contact your system administrator.",
  onRetry,
}: {
  error?: ApiError | Error | null;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onRetry?: () => void;
}) => {
  if (!error) return null;

  if (!(error instanceof ApiError)) {
    const uiError = new ApiError(fallbackMessage, {
      code: "UI_ERROR",
      title: fallbackTitle,
      status: 0,
      retryable: true,
      technicalMessage: error.message,
    });
    return <AppErrorAlert error={uiError} onRetry={onRetry} />;
  }

  return (
    <InlineAlert title={error.title || fallbackTitle} variant="error" requestId={error.requestId} persistent>
      <div className="space-y-3">
        <p>{error.message || fallbackMessage}</p>
        {error.suggestedAction ? <p><span className="font-medium">Suggested action:</span> {error.suggestedAction}</p> : null}
        <ErrorDetailsAccordion error={error} />
        <div className="flex flex-wrap gap-2">
          <CopyDiagnosticsButton diagnostics={toDiagnosticText(error)} />
          {onRetry && error.retryable ? (
            <button className="text-sm font-medium underline underline-offset-4" type="button" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </InlineAlert>
  );
};
