import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { displayMoney } from "@/features/employees/employee-format";
import type { Position } from "./positions.types";

export const PositionDetailDrawer = ({ position, open, canEdit, onOpenChange, onEdit }: {
  position: Position | null;
  open: boolean;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (position: Position) => void;
}) => {
  if (!position) return null;
  return (
    <DetailDrawer open={open} onOpenChange={onOpenChange} title={position.title} subtitle={position.code ?? "Position detail"} footer={canEdit ? <Button onClick={() => onEdit(position)}>Edit position</Button> : undefined}>
      <DetailSection title="Position Information" rows={[
        { label: "Name", value: position.title },
        { label: "Code", value: position.code ?? "Not set" },
        { label: "Department", value: position.department_name ?? position.department_id ?? "Not assigned" },
        { label: "Level", value: `Level ${position.level ?? 1}` },
        { label: "Default role", value: position.default_role_name ?? "Manual assignment" },
        { label: "Lower-level management", value: position.can_manage_lower_levels ? "Allowed" : "Not allowed" },
        { label: "Department approver candidate", value: position.can_act_as_department_approver ? "Yes" : "No" },
        { label: "Description", value: position.description ?? "Not recorded" },
        { label: "Default salary", value: displayMoney(position.default_salary_amount) },
        { label: "Status", value: <StatusBadge status={position.status} /> },
      ]} />
    </DetailDrawer>
  );
};
