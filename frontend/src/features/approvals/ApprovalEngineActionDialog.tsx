import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type ApprovalEngineDialogAction = "approve" | "reject" | "cancel" | "escalate";

export const ApprovalEngineActionDialog = ({
  action,
  open,
  loading,
  onOpenChange,
  onSubmit,
}: {
  action: ApprovalEngineDialogAction;
  open: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { reason?: string }) => void;
}) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsReason = action !== "approve";

  useEffect(() => {
    if (!open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const submit = () => {
    if (needsReason && reason.trim().length < 3) {
      setError("A reason is required for this approval action.");
      return;
    }
    setError(null);
    onSubmit({ reason: reason.trim() || undefined });
  };

  const title = action === "approve" ? "Approve request" : action === "reject" ? "Reject request" : action === "escalate" ? "Escalate request" : "Cancel request";
  const description = action === "approve"
    ? "Confirm approval for the current workflow step."
    : "Provide a clear reason so the approval timeline remains auditable.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {needsReason ? <Textarea value={reason} placeholder="Reason" onChange={(event) => setReason(event.target.value)} /> : null}
        {error ? <FormError message={error} /> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>{action === "approve" ? "Approve" : "Submit"}</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
