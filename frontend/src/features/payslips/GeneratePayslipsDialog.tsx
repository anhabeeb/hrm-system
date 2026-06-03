import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const GeneratePayslipsDialog = ({
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
  onSubmit: (payload: { payroll_run_id: string; outlet_id?: string; reason: string }) => void;
}) => {
  const [payload, setPayload] = useState({ payroll_run_id: "", outlet_id: "", reason: "" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate payslips</DialogTitle>
          <DialogDescription>Creates payslip metadata only. PDF generation remains a later backend step.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-1 text-sm">Payroll run ID<Input value={payload.payroll_run_id} onChange={(event) => setPayload((current) => ({ ...current, payroll_run_id: event.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Outlet ID optional<Input value={payload.outlet_id} onChange={(event) => setPayload((current) => ({ ...current, outlet_id: event.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(event) => setPayload((current) => ({ ...current, reason: event.target.value }))} /></Label>
          <FormError message={error ?? undefined} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={() => onSubmit({ payroll_run_id: payload.payroll_run_id, outlet_id: payload.outlet_id || undefined, reason: payload.reason })}>Generate payslips</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
