import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime } from "@/lib/safe-display";
import type { Payslip } from "./payslips.types";

export const PayslipDetailDrawer = ({
  payslip,
  open,
  onOpenChange,
}: {
  payslip: Payslip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={payslip?.employee_name ?? "Payslip"} subtitle={payslip?.payroll_month}>
    {payslip ? (
      <DetailSection
        title="Payslip metadata"
        rows={[
          { label: "Employee", value: payslip.employee_name ?? payslip.employee_code ?? payslip.employee_id },
          { label: "Outlet", value: payslip.outlet_name ?? payslip.outlet_id ?? "Unassigned" },
          { label: "Status", value: <StatusBadge status={payslip.status ?? "pending"} /> },
          { label: "Payroll run", value: payslip.payroll_run_id },
          { label: "Generated", value: formatDateTime(payslip.generated_at ?? payslip.created_at) },
          { label: "Published", value: formatDateTime(payslip.published_at) },
        ]}
      />
    ) : null}
  </DetailDrawer>
);
