import { useEffect, useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssetPayload, AssetRecord } from "./assets.types";

export const AssetForm = ({ asset, open, loading, error, onOpenChange, onSubmit }: { asset?: AssetRecord | null; open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: AssetPayload) => void }) => {
  const [payload, setPayload] = useState({ asset_code: "", asset_name: "", asset_type: "", outlet_id: "", purchase_value_amount: "", current_condition: "" });
  useEffect(() => {
    if (open) setPayload({
      asset_code: asset?.asset_code ?? "",
      asset_name: asset?.asset_name ?? "",
      asset_type: asset?.asset_type ?? "",
      outlet_id: asset?.outlet_id ?? "",
      purchase_value_amount: asset?.purchase_value_amount ? String(asset.purchase_value_amount) : "",
      current_condition: asset?.current_condition ?? "",
    });
  }, [asset, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{asset ? "Edit asset" : "Create asset"}</DialogTitle><DialogDescription>Money values are integer minor units.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label className="space-y-1 text-sm">Asset code<Input value={payload.asset_code} onChange={(event) => setPayload((p) => ({ ...p, asset_code: event.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Asset name<Input value={payload.asset_name} onChange={(event) => setPayload((p) => ({ ...p, asset_name: event.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Asset type<Input value={payload.asset_type} onChange={(event) => setPayload((p) => ({ ...p, asset_type: event.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Outlet<OutletCombobox value={payload.outlet_id} onChange={(value) => setPayload((p) => ({ ...p, outlet_id: value ?? "" }))} /></Label>
          <Label className="space-y-1 text-sm">Value minor units<Input type="number" min="1" step="1" value={payload.purchase_value_amount} onChange={(event) => setPayload((p) => ({ ...p, purchase_value_amount: event.target.value }))} /></Label>
          <Label className="space-y-1 text-sm">Condition<Input value={payload.current_condition} onChange={(event) => setPayload((p) => ({ ...p, current_condition: event.target.value }))} /></Label>
        </div>
        <FormError message={error ?? undefined} />
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit({ asset_code: payload.asset_code, asset_name: payload.asset_name, asset_type: payload.asset_type, outlet_id: payload.outlet_id || undefined, purchase_value_amount: payload.purchase_value_amount ? Number(payload.purchase_value_amount) : undefined, current_condition: payload.current_condition || undefined })}>{asset ? "Update asset" : "Create asset"}</LoadingButton></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
