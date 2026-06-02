import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import type { Department } from "./departments.types";

export const DepartmentDetailDrawer = ({ department, open, canEdit, onOpenChange, onEdit }: {
  department: Department | null;
  open: boolean;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (department: Department) => void;
}) => {
  if (!department) return null;
  return (
    <DetailDrawer open={open} onOpenChange={onOpenChange} title={department.name} subtitle={department.code ?? "Department detail"} footer={canEdit ? <Button onClick={() => onEdit(department)}>Edit department</Button> : undefined}>
      <DetailSection title="Department Information" rows={[
        { label: "Name", value: department.name },
        { label: "Code", value: department.code ?? "Not set" },
        { label: "Status", value: <StatusBadge status={department.status} /> },
      ]} />
    </DetailDrawer>
  );
};
