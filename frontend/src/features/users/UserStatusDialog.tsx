import { ReasonDialog } from "@/components/forms/ReasonDialog";
import type { AdminUser } from "./users.types";

export const UserStatusDialog = ({
  user,
  action,
  open,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  user: AdminUser | null;
  action: "enable" | "disable";
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
}) => (
  <ReasonDialog
    open={open}
    title={action === "enable" ? "Enable user" : "Disable user"}
    description={`${action === "enable" ? "Enable" : "Disable"} ${user?.full_name ?? user?.email ?? "this user"}. A reason is required for access changes.`}
    confirmLabel={action === "enable" ? "Enable" : "Disable"}
    loading={loading}
    error={error}
    onOpenChange={onOpenChange}
    onSubmit={onSubmit}
  />
);
