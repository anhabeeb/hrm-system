import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UniformIssuePayload } from "./uniforms.types";

export const UniformIssueDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: UniformIssuePayload) => void }) => {
  const [payload, setPayload] = useState({ employee_id: "", outlet_id: "", uniform_type: "", quantity: "1", issued_date: "", reason: "" });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Issue uniform</DialogTitle></DialogHeader><div className="space-y-3"><Label className="space-y-1 text-sm">Employee ID<Input value={payload.employee_id} onChange={(e) => setPayload((p) => ({ ...p, employee_id: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Outlet ID<Input value={payload.outlet_id} onChange={(e) => setPayload((p) => ({ ...p, outlet_id: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Uniform type<Input value={payload.uniform_type} onChange={(e) => setPayload((p) => ({ ...p, uniform_type: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Quantity<Input type="number" min="1" step="1" value={payload.quantity} onChange={(e) => setPayload((p) => ({ ...p, quantity: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Issue date<Input type="date" value={payload.issued_date} onChange={(e) => setPayload((p) => ({ ...p, issued_date: e.target.value }))} /></Label><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit({ employee_id: payload.employee_id, outlet_id: payload.outlet_id || undefined, uniform_type: payload.uniform_type, quantity: Number(payload.quantity), issued_date: payload.issued_date, reason: payload.reason || undefined })}>Issue uniform</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
