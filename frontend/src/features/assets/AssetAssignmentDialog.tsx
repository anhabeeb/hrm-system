import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AssetAssignPayload } from "./assets.types";

export const AssetAssignmentDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: AssetAssignPayload) => void }) => {
  const [payload, setPayload] = useState({ employee_id: "", outlet_id: "", issued_date: "", issue_condition: "", reason: "" });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Assign asset</DialogTitle><DialogDescription>Assign to either an employee or an outlet, not both.</DialogDescription></DialogHeader><div className="space-y-3"><Label className="space-y-1 text-sm">Employee ID<Input value={payload.employee_id} onChange={(e) => setPayload((p) => ({ ...p, employee_id: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Outlet ID<Input value={payload.outlet_id} onChange={(e) => setPayload((p) => ({ ...p, outlet_id: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Issued date<Input type="date" value={payload.issued_date} onChange={(e) => setPayload((p) => ({ ...p, issued_date: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Issue condition<Input value={payload.issue_condition} onChange={(e) => setPayload((p) => ({ ...p, issue_condition: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(e) => setPayload((p) => ({ ...p, reason: e.target.value }))} /></Label><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit({ employee_id: payload.employee_id || undefined, outlet_id: payload.outlet_id || undefined, issued_date: payload.issued_date, issue_condition: payload.issue_condition || undefined, reason: payload.reason })}>Assign asset</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
