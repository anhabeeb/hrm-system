import { InlineAlert } from "@/components/feedback/InlineAlert";

export const RoleAssignmentDialog = () => (
  <InlineAlert title="Role assignment is read-only for now." variant="info">
    The UI does not fake role updates while the backend role assignment endpoint is unavailable.
  </InlineAlert>
);
