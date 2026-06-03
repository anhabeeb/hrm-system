import { ReasonDialog } from "@/components/forms/ReasonDialog";
import type { AdminUser } from "./users.types";

export const ResetPasswordDialog = ({
  user,
  open,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  user: AdminUser | null;
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
}) => (
  <ReasonDialog
    open={open}
    title="Require password reset"
    description={`Require ${user?.full_name ?? user?.email ?? "this user"} to reset their password. Active sessions may be revoked.`}
    confirmLabel="Require reset"
    loading={loading}
    error={error}
    onOpenChange={onOpenChange}
    onSubmit={onSubmit}
  />
);
