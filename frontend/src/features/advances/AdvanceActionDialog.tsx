import { ReasonDialog } from "@/components/forms/ReasonDialog";

export const AdvanceActionDialog = ({
  open,
  action,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  action: "approve" | "reject";
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
}) => (
  <ReasonDialog
    open={open}
    title={action === "approve" ? "Approve advance" : "Reject advance"}
    description="A reason is required for advance payment approval decisions."
    confirmLabel={action === "approve" ? "Approve" : "Reject"}
    loading={loading}
    error={error}
    onOpenChange={onOpenChange}
    onSubmit={onSubmit}
  />
);
