import { InlineAlert } from "@/components/feedback/InlineAlert";

export const UserForm = () => (
  <InlineAlert title="User create/edit endpoints are not connected yet." variant="info">
    Email invitations and admin user mutation screens will be enabled after the backend users endpoint is registered.
  </InlineAlert>
);
