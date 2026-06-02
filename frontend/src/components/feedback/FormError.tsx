import { InlineAlert } from "./InlineAlert";

export const FormError = ({ message, requestId }: { message?: string; requestId?: string }) => {
  if (!message) return null;
  return (
    <InlineAlert title={message} variant="error" requestId={requestId}>
      Please review the form and try again.
    </InlineAlert>
  );
};
