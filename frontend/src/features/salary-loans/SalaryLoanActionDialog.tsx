import { ReasonDialog } from "@/components/forms/ReasonDialog";

const labels = {
  approve: ["Approve salary loan", "Approve loan and generate the installment schedule.", "Approve"],
  pause: ["Pause salary loan", "Pause future unlocked installment deductions.", "Pause"],
  settle: ["Settle salary loan", "Settle the loan and stop future unlocked deductions.", "Settle"],
} as const;

export const SalaryLoanActionDialog = ({
  open,
  action,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  action: "approve" | "pause" | "settle";
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
}) => {
  const copy = labels[action];
  return <ReasonDialog open={open} title={copy[0]} description={copy[1]} confirmLabel={copy[2]} loading={loading} error={error} onOpenChange={onOpenChange} onSubmit={onSubmit} />;
};
