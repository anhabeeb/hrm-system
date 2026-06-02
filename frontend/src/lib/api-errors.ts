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

export const createNetworkError = () =>
  new ApiError("Unable to connect to the server. Please check your connection and try again.", {
    code: "NETWORK_UNREACHABLE",
    title: "API is unreachable",
    status: 0,
    requestId: createClientRequestId(),
    retryable: true,
    suggestedAction: "Check your internet connection and confirm the API deployment is reachable.",
  });

export const createTimeoutError = () =>
  new ApiError("The request timed out before the server responded.", {
    code: "REQUEST_TIMEOUT",
    title: "Request timed out",
    status: 0,
    requestId: createClientRequestId(),
    retryable: true,
    suggestedAction: "Try again. If the issue continues, check API performance and Worker logs.",
  });

export const createInvalidApiResponseError = (status: number) =>
  new ApiError("The server returned a response the app could not read.", {
    code: "INVALID_API_RESPONSE",
    title: "Invalid API response",
    status,
    requestId: createClientRequestId(),
    retryable: status >= 500,
    suggestedAction: "Try again. If this continues, check the API route and deployment configuration.",
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
  ];

  return lines.filter(Boolean).join("\n");
};

export const handleSessionExpired = (error: ApiError) => {
  if (error.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new CustomEvent("hrm:session-expired", { detail: error.message }));
  }
};
