import { Link } from "react-router-dom";

import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/safe-display";
import type { PayrollRun } from "./payroll.types";

export const PayrollRunDetailDrawer = ({
  run,
  open,
  onOpenChange,
}: {
  run: PayrollRun | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={run?.payroll_month ?? "Payroll run"} subtitle={run?.totals_scope ? `Totals scope: ${run.totals_scope}` : undefined}>
    {run ? (
      <DetailSection
        title="Run summary"
        rows={[
          { label: "Status", value: <StatusBadge status={run.status} /> },
          { label: "Period", value: run.period_start && run.period_end ? `${run.period_start} to ${run.period_end}` : run.payroll_month },
          { label: "Currency", value: run.currency ?? "MVR" },
          { label: "Calculation", value: <StatusBadge status={run.calculation_status ?? "not_calculated"} /> },
          { label: "Calculation version", value: run.calculation_version ?? 0 },
          { label: "Last calculated", value: formatDateTime(run.calculated_at) },
          { label: "Employees", value: run.employee_count ?? run.item_count ?? 0 },
          { label: "Gross", value: <MoneyAmount amount={run.total_gross_amount ?? run.gross_amount} /> },
          { label: "Deductions", value: <MoneyAmount amount={run.total_deduction_amount ?? run.deductions_amount} /> },
          { label: "Net", value: <MoneyAmount amount={run.total_net_amount ?? run.net_amount} /> },
          { label: "Exceptions", value: run.exception_count ?? 0 },
          { label: "Payslips", value: <Button asChild size="sm" variant="outline"><Link to={`/payslips?payroll_run_id=${encodeURIComponent(run.id)}`}>Open payslips</Link></Button> },
          { label: "Locked at", value: formatDateTime(run.locked_at) },
          { label: "Created", value: formatDateTime(run.created_at) },
        ]}
      />
    ) : null}
  </DetailDrawer>
);
