import type { ApiError } from "@/lib/api-errors";

export const ErrorDetailsAccordion = ({ error }: { error: ApiError }) => {
  const rows = [
    ["Error code", error.code],
    ["Request ID", error.requestId],
    ["Failed step", error.step],
    ["Route", [error.method, error.route].filter(Boolean).join(" ") || undefined],
    ["Status", String(error.status)],
    ["Retryable", error.retryable ? "Yes" : "No"],
    ["Technical detail", error.technicalMessage],
    ["Suggested action", error.suggestedAction],
    ["Request URL", error.diagnostics?.requestUrl],
    ["API base URL", error.diagnostics?.apiBaseUrl || (error.diagnostics?.apiBaseUrl === "" ? "(same-origin)" : undefined)],
    ["API base source", error.diagnostics?.apiBaseUrlSource],
    ["Current page URL", error.diagnostics?.currentPageUrl],
    ["Browser online", error.diagnostics?.browserOnline === undefined ? undefined : error.diagnostics.browserOnline ? "Yes" : "No"],
    ["Fetch error name", error.diagnostics?.errorName],
    ["Fetch error message", error.diagnostics?.errorMessage],
    ["Timeout", error.diagnostics?.timeout === undefined ? undefined : error.diagnostics.timeout ? "Yes" : "No"],
    ["CORS suspected", error.diagnostics?.corsSuspected === undefined ? undefined : error.diagnostics.corsSuspected ? "Yes" : "No"],
    ["Mixed content suspected", error.diagnostics?.mixedContentSuspected === undefined ? undefined : error.diagnostics.mixedContentSuspected ? "Yes" : "No"],
    ["Build version", error.diagnostics?.buildVersion],
    ["Elapsed ms", error.diagnostics?.elapsedMs === undefined ? undefined : String(error.diagnostics.elapsedMs)],
  ].filter(([, value]) => value);

  if (rows.length === 0) return null;

  return (
    <details className="mt-3 rounded-md border border-current/20 bg-white/50 p-3 text-xs">
      <summary className="cursor-pointer font-medium">Show diagnostics</summary>
      <dl className="mt-3 grid gap-2">
        {rows.map(([label, value]) => (
          <div className="grid gap-1 sm:grid-cols-[9rem_1fr]" key={label}>
            <dt className="font-medium opacity-75">{label}</dt>
            <dd className="break-words font-mono">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
};
