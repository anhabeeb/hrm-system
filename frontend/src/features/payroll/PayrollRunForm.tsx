import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PayrollCalculatePayload } from "./payroll.types";

export const PayrollRunForm = ({
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
  onSubmit: (payload: PayrollCalculatePayload) => void;
}) => {
  const [payload, setPayload] = useState<PayrollCalculatePayload>({ payroll_month: "", reason: "" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Calculate payroll draft</DialogTitle>
          <DialogDescription>Payroll calculation creates a draft company-wide run. Outlet-limited recalculation is intentionally not supported.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-1 text-sm">Payroll month<Input type="month" value={payload.payroll_month} onChange={(event) => setPayload((current) => ({ ...current, payroll_month: event.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason ?? ""} onChange={(event) => setPayload((current) => ({ ...current, reason: event.target.value }))} /></Label>
          <FormError message={error ?? undefined} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={() => onSubmit(payload)}>Calculate payroll</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
