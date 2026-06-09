import { ApiError } from "@/lib/api-errors";
import { friendlyHrmError } from "@/lib/hrm-errors";
import type { ToastContextValue } from "./useToast";

const titleForApiError = (error: ApiError) => {
  if (error.code === "SESSION_EXPIRED") return "Session expired";
  if (error.status === 403 || error.code.includes("PERMISSION")) return "Permission denied";
  if (error.status === 0) return "Unable to connect";
  return error.title || "Action failed";
};

export const toastError = (
  toast: Pick<ToastContextValue, "error">,
  error: unknown,
  fallback = "Action could not be completed.",
  lockedContext?: Parameters<typeof friendlyHrmError>[2],
) => {
  const message = friendlyHrmError(error, fallback, lockedContext);
  const title = error instanceof ApiError ? titleForApiError(error) : "Action failed";
  toast.error(title, message, { id: error instanceof ApiError ? `api-error-${error.code}-${error.requestId ?? ""}` : undefined });
};

export const toastSuccess = (
  toast: Pick<ToastContextValue, "success">,
  title: string,
  message?: string,
) => {
  toast.success(title, message);
};
