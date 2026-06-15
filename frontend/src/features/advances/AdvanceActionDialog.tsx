import { ReasonDialog } from "@/components/forms/ReasonDialog";

type AdvanceAction = "approve" | "reject" | "cancel" | "executePayment";

const actionCopy: Record<AdvanceAction, { title: string; description: string; confirmLabel: string }> = {
  approve: {
    title: "Approve advance",
    description: "A reason is required for advance payment approval decisions.",
    confirmLabel: "Approve",
  },
  reject: {
    title: "Reject advance",
    description: "A reason is required for advance payment rejection decisions.",
    confirmLabel: "Reject",
  },
  cancel: {
    title: "Cancel advance request",
    description: "A reason is required to cancel this advance request.",
    confirmLabel: "Cancel request",
  },
  executePayment: {
    title: "Execute advance salary payment",
    description: "Record payment execution after final approval. Payroll deduction records will be scheduled safely.",
    confirmLabel: "Execute payment",
  },
};

export const AdvanceActionDialog = ({
  open,
  action,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  action: AdvanceAction;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
}) => {
  const copy = actionCopy[action];
  return (
    <ReasonDialog
      open={open}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      loading={loading}
      error={error}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  );
};
