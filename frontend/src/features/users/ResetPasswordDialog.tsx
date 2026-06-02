import { InlineAlert } from "@/components/feedback/InlineAlert";

export const ResetPasswordDialog = () => (
  <InlineAlert title="Admin password reset is not connected yet." variant="info">
    The UI will not generate or display plaintext passwords without an explicit safe one-time backend flow.
  </InlineAlert>
);
