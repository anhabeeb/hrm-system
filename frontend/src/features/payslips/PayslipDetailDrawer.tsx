import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime } from "@/lib/safe-display";
import type { Payslip } from "./payslips.types";

const payrollLabel = (payslip: Payslip) => {
  const month = payslip.payroll_month;
  if (!month) return "Payroll period not recorded";
  const [year, monthNumber] = month.split("-").map(Number);
  const date = Number.isFinite(year) && Number.isFinite(monthNumber)
    ? new Date(Date.UTC(year, monthNumber - 1, 1))
    : null;
  const label = date
    ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)
    : month;
  return `${label}${payslip.status ? ` - ${payslip.status.replace(/_/g, " ")}` : ""}`;
};

export const PayslipDetailDrawer = ({
  payslip,
  open,
  onOpenChange,
}: {
  payslip: Payslip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={payslip?.employee_name ?? "Payslip"} subtitle={payslip ? payrollLabel(payslip) : undefined}>
    {payslip ? (
      <DetailSection
        title="Payslip metadata"
        rows={[
          { label: "Employee", value: payslip.employee_name ?? payslip.employee_code ?? payslip.employee_id },
          { label: "Outlet", value: payslip.outlet_name ?? payslip.outlet_id ?? "Unassigned" },
          { label: "Payroll period", value: payrollLabel(payslip) },
          { label: "Status", value: <StatusBadge status={payslip.status ?? "pending"} /> },
          { label: "Generated", value: formatDateTime(payslip.generated_at ?? payslip.created_at) },
          { label: "Published", value: formatDateTime(payslip.published_at) },
          { label: "Technical payroll run ID", value: payslip.payroll_run_id ?? "Not recorded" },
        ]}
      />
    ) : null}
  </DetailDrawer>
);
