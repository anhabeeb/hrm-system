import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { PayrollItem } from "./payroll.types";

export const PayrollItemDetailDrawer = ({
  item,
  open,
  onOpenChange,
}: {
  item: PayrollItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={item?.employee_name ?? "Payroll item"} subtitle={item?.employee_code ?? item?.employee_id}>
    {item ? (
      <DetailSection
        title="Payroll row"
        rows={[
          { label: "Outlet", value: item.outlet_name ?? item.outlet_id ?? "Unassigned" },
          { label: "Gross", value: <MoneyAmount amount={item.gross_amount ?? item.total_earnings_amount} /> },
          { label: "Deductions", value: <MoneyAmount amount={item.total_deductions_amount} /> },
          { label: "Net", value: <MoneyAmount amount={item.net_amount} /> },
          { label: "Status", value: <StatusBadge status={item.status ?? "draft"} /> },
          { label: "Payslip", value: <StatusBadge status={item.payslip_status ?? "pending"} /> },
        ]}
      />
    ) : null}
  </DetailDrawer>
);
