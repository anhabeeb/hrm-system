import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { AppMonthPicker } from "@/components/forms/AppMonthPicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssetDeductionPayload } from "./assets.types";

export const AssetDeductionDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: AssetDeductionPayload) => void }) => {
  const [payload, setPayload] = useState({ amount: "", deduction_month: "", reason: "" });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Request asset deduction</DialogTitle></DialogHeader><div className="space-y-3"><Label className="space-y-1 text-sm">Amount minor units<Input type="number" min="1" step="1" value={payload.amount} onChange={(e) => setPayload((p) => ({ ...p, amount: e.target.value }))} /></Label><AppMonthPicker label="Deduction month" value={payload.deduction_month} onChange={(value) => setPayload((p) => ({ ...p, deduction_month: value ?? "" }))} /><Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))} /></Label><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit({ amount: Number(payload.amount), deduction_month: payload.deduction_month || undefined, reason: payload.reason })}>Request deduction</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
