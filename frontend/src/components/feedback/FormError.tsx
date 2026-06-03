import type { ApiError } from "@/lib/api-errors";

import { FormErrorPanel } from "./FormErrorPanel";

export const FormError = ({
  error,
  message,
  requestId,
}: {
  error?: ApiError | null;
  message?: string;
  requestId?: string;
}) => <FormErrorPanel error={error} message={message} requestId={requestId} />;
