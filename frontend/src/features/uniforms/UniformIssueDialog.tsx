import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UniformIssuePayload } from "./uniforms.types";

export const UniformIssueDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: UniformIssuePayload) => void }) => {
  const [payload, setPayload] = useState({ employee_id: "", outlet_id: "", uniform_type: "", quantity: "1", issued_date: "", reason: "" });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Issue uniform</DialogTitle></DialogHeader><div className="space-y-3"><Label className="space-y-1 text-sm">Employee<EmployeeCombobox value={payload.employee_id} outletId={payload.outlet_id} onChange={(value) => setPayload((p) => ({ ...p, employee_id: value ?? "" }))} /></Label><Label className="space-y-1 text-sm">Outlet<OutletCombobox value={payload.outlet_id} onChange={(value) => setPayload((p) => ({ ...p, outlet_id: value ?? "", employee_id: "" }))} /></Label><Label className="space-y-1 text-sm">Uniform type<Input value={payload.uniform_type} onChange={(e) => setPayload((p) => ({ ...p, uniform_type: e.target.value }))} /></Label><Label className="space-y-1 text-sm">Quantity<Input type="number" min="1" step="1" value={payload.quantity} onChange={(e) => setPayload((p) => ({ ...p, quantity: e.target.value }))} /></Label><AppDatePicker label="Issue date" value={payload.issued_date} onChange={(value) => setPayload((p) => ({ ...p, issued_date: value ?? "" }))} /><FormError message={error ?? undefined} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit({ employee_id: payload.employee_id, outlet_id: payload.outlet_id || undefined, uniform_type: payload.uniform_type, quantity: Number(payload.quantity), issued_date: payload.issued_date, reason: payload.reason || undefined })}>Issue uniform</LoadingButton></DialogFooter></DialogContent></Dialog>;
};
