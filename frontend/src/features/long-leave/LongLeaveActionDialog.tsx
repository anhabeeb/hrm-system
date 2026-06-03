import { ReasonDialog } from "@/components/forms/ReasonDialog";

export const LongLeaveActionDialog = ({
  open,
  title,
  description,
  confirmLabel,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
}) => (
  <ReasonDialog
    open={open}
    title={title}
    description={description}
    confirmLabel={confirmLabel}
    loading={loading}
    error={error}
    onOpenChange={onOpenChange}
    onSubmit={onSubmit}
  />
);
