import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate } from "@/lib/safe-display";
import type { UniformRecord } from "./uniforms.types";

export const UniformDetailDrawer = ({ uniform, open, onOpenChange }: { uniform: UniformRecord | null; open: boolean; onOpenChange: (open: boolean) => void }) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={uniform?.uniform_type ?? "Uniform"} subtitle={uniform?.employee_name ?? uniform?.employee_id}>
    {uniform ? <DetailSection title="Uniform Issue" rows={[
      { label: "Employee", value: uniform.employee_name ?? uniform.employee_id },
      { label: "Outlet", value: uniform.outlet_name ?? uniform.outlet_id ?? "Unassigned" },
      { label: "Quantity", value: uniform.quantity ?? 0 },
      { label: "Issued", value: formatDate(uniform.issued_date) },
      { label: "Returned", value: formatDate(uniform.returned_date) },
      { label: "Status", value: <StatusBadge status={uniform.status ?? "pending"} /> },
    ]} /> : null}
  </DetailDrawer>
);
