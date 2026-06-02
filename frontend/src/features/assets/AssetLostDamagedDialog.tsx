import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssetMarkPayload } from "./assets.types";

export const AssetLostDamagedDialog = ({ mode, open, loading, error, onOpenChange, onSubmit }: { mode: "lost" | "damaged"; open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: AssetMarkPayload) => void }) => {
  const [payload, setPayload] = useState({ reason: "", deduction_amount: "", deduction_month: "", request_deduction: false });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{mode === "lost" ? "Mark asset as lost" : "Mark asset as damaged"}</DialogTitle><DialogDescription>This keeps the asset pending for HR/final settlement until resolved by backend workflow.</DialogDescription></DialogHeader><div className="space-y-3"><Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))} /></Label><div className="flex items-center gap-2"><Checkbox checked={payload.request_deduction} onCheckedChange={(checked) => setPayload((p) => ({ ...p, request_deduction: Boolean(checked) }))} /><span className="text-sm">Request deduction</span></div><Label className="space-y-1 text-sm">Deduction amount<Input type="number" min="1" step="1" value={payload.deduction_amount} onChange={(e) => setPayload((p) => ({ ...p, deduction_amount: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Deduction month<Input type="month" value={payload.deduction_month} onChange={(e) => setPayload((p) => ({ ...p, deduction_month: e.target.value }))} /></Label><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit({ reason: payload.reason, request_deduction: payload.request_deduction, deduction_amount: payload.deduction_amount ? Number(payload.deduction_amount) : undefined, deduction_month: payload.deduction_month || undefined })}>{mode === "lost" ? "Mark lost" : "Mark damaged"}</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
