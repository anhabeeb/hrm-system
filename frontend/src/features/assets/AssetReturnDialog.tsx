import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssetReturnPayload } from "./assets.types";

export const AssetReturnDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: AssetReturnPayload) => void }) => {
  const [payload, setPayload] = useState({ returned_date: "", return_condition: "", reason: "" });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Return asset</DialogTitle></DialogHeader><div className="space-y-3"><Label className="space-y-1 text-sm">Returned date<Input type="date" value={payload.returned_date} onChange={(e) => setPayload((p) => ({ ...p, returned_date: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Return condition<Input value={payload.return_condition} onChange={(e) => setPayload((p) => ({ ...p, return_condition: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))} /></Label><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit({ returned_date: payload.returned_date, return_condition: payload.return_condition || undefined, reason: payload.reason })}>Return asset</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
