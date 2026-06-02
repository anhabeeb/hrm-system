import { InlineAlert } from "@/components/feedback/InlineAlert";

export const UserStatusDialog = () => (
  <InlineAlert title="User status actions require backend support." variant="info">
    Enable and disable actions will require confirmation and a reason once the endpoint is available.
  </InlineAlert>
);
