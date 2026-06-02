import { AppErrorAlert } from "./AppErrorAlert";
import { ApiError } from "@/lib/api-errors";

export const FormErrorPanel = ({
  error,
  message,
  requestId,
}: {
  error?: ApiError | null;
  message?: string;
  requestId?: string;
}) => {
  if (error) return <AppErrorAlert error={error} fallbackTitle="Please review the form" />;
  if (!message) return null;

  return (
    <AppErrorAlert
      error={
        new ApiError(message, {
          code: "FORM_ERROR",
          title: message,
          status: 0,
          requestId,
          retryable: false,
        })
      }
      fallbackTitle={message}
    />
  );
};
