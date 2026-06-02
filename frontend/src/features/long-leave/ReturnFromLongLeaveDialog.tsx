import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const ReturnFromLongLeaveDialog = ({
  open,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (actualReturnDate: string, reason: string) => void;
}) => {
  const [actualReturnDate, setActualReturnDate] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm return from long leave</DialogTitle>
          <DialogDescription>Confirming return may affect payroll-impact records for the return month.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-1 text-sm">Actual return date<Input type="date" value={actualReturnDate} onChange={(event) => setActualReturnDate(event.target.value)} /></Label>
          <Label className="space-y-1 text-sm">Reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
          <FormError message={error ?? undefined} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={() => onSubmit(actualReturnDate, reason)}>Confirm return</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
