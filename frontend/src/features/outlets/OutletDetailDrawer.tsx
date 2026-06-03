import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import type { Outlet } from "./outlets.types";

export const OutletDetailDrawer = ({ outlet, open, canEdit, onOpenChange, onEdit }: {
  outlet: Outlet | null;
  open: boolean;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (outlet: Outlet) => void;
}) => {
  if (!outlet) return null;
  return (
    <DetailDrawer open={open} onOpenChange={onOpenChange} title={outlet.name} subtitle={outlet.code ?? "Outlet detail"} footer={canEdit ? <Button onClick={() => onEdit(outlet)}>Edit outlet</Button> : undefined}>
      <DetailSection title="Outlet Information" rows={[
        { label: "Code", value: outlet.code ?? "Not set" },
        { label: "Name", value: outlet.name },
        { label: "Location", value: outlet.address ?? "Not set" },
        { label: "Phone", value: outlet.phone ?? "Not set" },
        { label: "Status", value: <StatusBadge status={outlet.status} /> },
      ]} />
    </DetailDrawer>
  );
};
