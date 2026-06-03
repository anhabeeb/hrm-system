import { ReasonDialog } from "@/components/forms/ReasonDialog";

export const DocumentDeleteDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (reason: string) => void }) => (
  <ReasonDialog open={open} title="Delete document" description="A reason is required. Document file keys are never shown in this UI." confirmLabel="Delete document" loading={loading} error={error} onOpenChange={onOpenChange} onSubmit={onSubmit} />
);
