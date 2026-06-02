import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/safe-display";
import type { AdvancePayment } from "./advances.types";

export const AdvanceDetailDrawer = ({
  advance,
  open,
  onOpenChange,
}: {
  advance: AdvancePayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={advance?.employee_name ?? "Advance payment"} subtitle={advance?.employee_code ?? advance?.employee_id}>
    {advance ? (
      <DetailSection
        title="Advance"
        rows={[
          { label: "Outlet", value: advance.outlet_name ?? advance.outlet_id ?? "Unassigned" },
          { label: "Amount", value: <MoneyAmount amount={advance.amount} /> },
          { label: "Paid date", value: formatDate(advance.paid_date) },
          { label: "Deduction month", value: advance.deduction_month },
          { label: "Status", value: <StatusBadge status={advance.status ?? "pending"} /> },
          { label: "Created", value: formatDateTime(advance.created_at) },
        ]}
      />
    ) : null}
  </DetailDrawer>
);
