import { clearAuthToken } from "./auth-token";
import { SESSION_EXPIRED_MESSAGE } from "./constants";

export class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;
  details?: unknown;

  constructor(message: string, options: { code: string; status: number; requestId?: string; details?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export const friendlyMessageForStatus = (status: number) => {
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "The requested record could not be found.";
  if (status === 409) return "This action could not be completed because the record has changed.";
  if (status === 422) return "Please review the highlighted fields and try again.";
  if (status >= 500) return "Something went wrong. Please try again or contact support.";
  return "The request could not be completed.";
};

export const handleSessionExpired = (error: ApiError) => {
  if (error.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new CustomEvent("hrm:session-expired", { detail: error.message }));
  }
};
