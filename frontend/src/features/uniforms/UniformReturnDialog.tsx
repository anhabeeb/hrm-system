import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { UniformReturnPayload } from "./uniforms.types";

export const UniformReturnDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: UniformReturnPayload) => void }) => {
  const [payload, setPayload] = useState({ returned_date: "", reason: "" });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Return uniform</DialogTitle></DialogHeader><div className="space-y-3"><AppDatePicker label="Return date" value={payload.returned_date} onChange={(value) => setPayload((p) => ({ ...p, returned_date: value ?? "" }))} /><Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))} /></Label><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit(payload)}>Return uniform</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
