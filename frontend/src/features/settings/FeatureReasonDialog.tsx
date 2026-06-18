import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api-errors";
import type { FeatureSetting } from "./settings.types";

export const FeatureReasonDialog = ({
  open,
  feature,
  nextEnabled,
  loading,
  error,
  dependencyWarning,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  feature: FeatureSetting | null;
  nextEnabled: boolean;
  loading?: boolean;
  error?: ApiError | null;
  dependencyWarning?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) => {
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setValidationError(null);
    }
  }, [open]);

  const submit = () => {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setValidationError("A reason is required for this action.");
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update feature setting</DialogTitle>
          <DialogDescription>Please provide a reason for changing this feature setting.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{feature?.feature_name ?? "Feature setting"}</div>
            <div className="text-muted-foreground">New status: {nextEnabled ? "Enabled" : "Disabled"}</div>
            {dependencyWarning ? <div className="mt-2 text-amber-700">{dependencyWarning}</div> : null}
          </div>
          <FormError message={error?.message ?? validationError ?? undefined} requestId={error?.requestId} />
          <div className="space-y-2">
            <Label htmlFor="feature-change-reason">Reason</Label>
            <Textarea
              id="feature-change-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setValidationError(null);
              }}
              placeholder="Explain why this feature setting is changing"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoadingButton type="button" loading={loading} loadingText="Saving..." onClick={submit}>
            Save
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
