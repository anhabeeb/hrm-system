import { clearAuthToken } from "./auth-token";
import { SESSION_EXPIRED_MESSAGE } from "./constants";

export interface ApiErrorOptions {
  code: string;
  status: number;
  title?: string;
  requestId?: string;
  technicalMessage?: string;
  route?: string;
  method?: string;
  step?: string;
  retryable?: boolean;
  suggestedAction?: string;
  fieldErrors?: Record<string, string>;
  details?: unknown;
  diagnostics?: ApiErrorDiagnostics;
}

export interface ApiErrorDiagnostics {
  requestUrl?: string;
  apiBaseUrl?: string;
  apiBaseUrlSource?: string;
  method?: string;
  browserOnline?: boolean;
  errorName?: string;
  errorMessage?: string;
  timeout?: boolean;
  corsSuspected?: boolean;
  mixedContentSuspected?: boolean;
  currentPageUrl?: string;
  buildVersion?: string;
  requestStartedAt?: string;
  requestEndedAt?: string;
  elapsedMs?: number;
}

const createClientRequestId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `ui_${crypto.randomUUID()}`;
  }
  return `ui_${Date.now().toString(36)}`;
};

export class ApiError extends Error {
  code: string;
  status: number;
  title: string;
  requestId?: string;
  technicalMessage?: string;
  route?: string;
  method?: string;
  step?: string;
  retryable: boolean;
  suggestedAction?: string;
  fieldErrors?: Record<string, string>;
  details?: unknown;
  diagnostics?: ApiErrorDiagnostics;

  constructor(message: string, options: ApiErrorOptions) {
    super(message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.title = options.title ?? friendlyTitleForCode(options.code);
    this.requestId = options.requestId;
    this.technicalMessage = options.technicalMessage;
    this.route = options.route;
    this.method = options.method;
    this.step = options.step;
    this.retryable = options.retryable ?? (options.status >= 500 || options.status === 0);
    this.suggestedAction = options.suggestedAction;
    this.fieldErrors = options.fieldErrors;
    this.details = options.details;
    this.diagnostics = options.diagnostics;
  }
}

export const friendlyTitleForCode = (code: string) =>
  code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const friendlyMessageForStatus = (status: number) => {
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested record could not be found.";
  if (status === 409) return "This action could not be completed because the record has changed.";
  if (status === 422) return "Please review the highlighted fields and try again.";
  if (status >= 500) return "Something went wrong. Please try again or contact support.";
  return "The request could not be completed.";
};

const networkSuggestedAction = (diagnostics?: ApiErrorDiagnostics) =>
  diagnostics?.apiBaseUrl === ""
    ? "Check Worker route/custom domain configuration. If frontend and API are separate deployments, set VITE_API_BASE_URL to the API Worker origin. If same-origin is intended, configure Workers Static Assets with run_worker_first for /api/*."
    : "Check your internet connection and confirm the configured API deployment is reachable.";

export const createNetworkError = (diagnostics?: ApiErrorDiagnostics) =>
  new ApiError("Unable to connect to the server. Please check your connection and try again.", {
    code: "NETWORK_UNREACHABLE",
    title: "API is unreachable",
    status: 0,
    requestId: createClientRequestId(),
    retryable: true,
    suggestedAction: networkSuggestedAction(diagnostics),
    diagnostics,
  });

export const createCorsBlockedError = (diagnostics?: ApiErrorDiagnostics) =>
  new ApiError("The browser blocked the API request before the app could read a response.", {
    code: "CORS_BLOCKED",
    title: "API request was blocked",
    status: 0,
    requestId: createClientRequestId(),
    retryable: true,
    suggestedAction: "Confirm the API allows this frontend origin and includes the required CORS headers.",
    diagnostics,
  });

export const createMixedContentError = (diagnostics?: ApiErrorDiagnostics) =>
  new ApiError("The page is loaded over HTTPS but the API URL uses HTTP, so the browser blocked the request.", {
    code: "MIXED_CONTENT_BLOCKED",
    title: "Mixed content blocked",
    status: 0,
    requestId: createClientRequestId(),
    retryable: false,
    suggestedAction: "Use an HTTPS API URL or same-origin relative API path.",
    diagnostics,
  });

export const createTimeoutError = (diagnostics?: ApiErrorDiagnostics) =>
  new ApiError("The request timed out before the server responded.", {
    code: "API_TIMEOUT",
    title: "Request timed out",
    status: 0,
    requestId: createClientRequestId(),
    retryable: true,
    suggestedAction: "Try again. If the issue continues, check API performance and Worker logs.",
    diagnostics: { ...diagnostics, timeout: true },
  });

export const createInvalidApiResponseError = (status: number, diagnostics?: ApiErrorDiagnostics) =>
  new ApiError("The server returned a response the app could not read.", {
    code: "INVALID_API_RESPONSE",
    title: "Invalid API response",
    status,
    requestId: createClientRequestId(),
    retryable: status >= 500,
    suggestedAction: "Try again. If this continues, check the API route and deployment configuration.",
    diagnostics,
  });

export const createHtmlApiResponseError = (status: number, diagnostics?: ApiErrorDiagnostics) =>
  new ApiError("The API route returned HTML instead of JSON. The request may have reached the frontend app shell instead of the API Worker.", {
    code: "API_HTML_RESPONSE",
    title: "API returned HTML",
    status,
    requestId: createClientRequestId(),
    retryable: false,
    suggestedAction: "Verify /api routes are handled before the SPA fallback and that the frontend points to the correct API deployment.",
    diagnostics,
  });

export const createApiBaseUrlInvalidError = (apiBaseUrl: string, diagnostics?: ApiErrorDiagnostics) =>
  new ApiError("The configured API base URL is not valid.", {
    code: "API_BASE_URL_INVALID",
    title: "API base URL is invalid",
    status: 0,
    requestId: createClientRequestId(),
    retryable: false,
    suggestedAction: "Set VITE_API_BASE_URL to a valid HTTPS origin, or leave it empty for same-origin /api/v1 requests.",
    technicalMessage: `Invalid API base URL: ${apiBaseUrl}`,
    diagnostics,
  });

export const toDiagnosticText = (error: ApiError, heading = "HRM App Error") => {
  const lines = [
    heading,
    error.requestId ? `Request ID: ${error.requestId}` : undefined,
    `Code: ${error.code}`,
    error.route || error.method ? `Route: ${[error.method, error.route].filter(Boolean).join(" ")}` : undefined,
    error.step ? `Step: ${error.step}` : undefined,
    `Status: ${error.status}`,
    `Retryable: ${error.retryable}`,
    `Title: ${error.title}`,
    `Message: ${error.message}`,
    error.technicalMessage ? `Technical: ${error.technicalMessage}` : undefined,
    error.suggestedAction ? `Suggested action: ${error.suggestedAction}` : undefined,
    error.diagnostics?.requestUrl ? `Request URL: ${error.diagnostics.requestUrl}` : undefined,
    error.diagnostics?.apiBaseUrl !== undefined ? `API base URL: ${error.diagnostics.apiBaseUrl || "(same-origin)"}` : undefined,
    error.diagnostics?.apiBaseUrlSource ? `API base source: ${error.diagnostics.apiBaseUrlSource}` : undefined,
    error.diagnostics?.method ? `Method: ${error.diagnostics.method}` : undefined,
    error.diagnostics?.browserOnline !== undefined ? `Browser online: ${error.diagnostics.browserOnline}` : undefined,
    error.diagnostics?.errorName ? `Fetch error name: ${error.diagnostics.errorName}` : undefined,
    error.diagnostics?.errorMessage ? `Fetch error message: ${error.diagnostics.errorMessage}` : undefined,
    error.diagnostics?.timeout !== undefined ? `Timeout: ${error.diagnostics.timeout}` : undefined,
    error.diagnostics?.corsSuspected !== undefined ? `CORS suspected: ${error.diagnostics.corsSuspected}` : undefined,
    error.diagnostics?.mixedContentSuspected !== undefined ? `Mixed content suspected: ${error.diagnostics.mixedContentSuspected}` : undefined,
    error.diagnostics?.currentPageUrl ? `Current page: ${error.diagnostics.currentPageUrl}` : undefined,
    error.diagnostics?.buildVersion ? `Build version: ${error.diagnostics.buildVersion}` : undefined,
    error.diagnostics?.requestStartedAt ? `Request started: ${error.diagnostics.requestStartedAt}` : undefined,
    error.diagnostics?.requestEndedAt ? `Request ended: ${error.diagnostics.requestEndedAt}` : undefined,
    error.diagnostics?.elapsedMs !== undefined ? `Elapsed ms: ${error.diagnostics.elapsedMs}` : undefined,
  ];

  return lines.filter(Boolean).join("\n");
};

export const handleSessionExpired = (error: ApiError) => {
  if (error.status === 401) {
    clearAuthToken();
    const message = error.code === "SESSION_EXPIRED"
      ? "Your session expired due to inactivity. Please sign in again."
      : error.message;
    window.dispatchEvent(new CustomEvent("hrm:session-expired", { detail: message }));
    if (typeof window !== "undefined") {
      const location = window.location as {
        href: string;
        pathname?: string;
        assign?: (url: string) => void;
      };
      const pathname = location.pathname ?? new URL(location.href).pathname;
      if (!pathname.startsWith("/login")) {
        if (location.assign) {
          location.assign("/login?reason=session_expired");
        } else {
          location.href = "/login?reason=session_expired";
        }
      }
    }
  }
};
