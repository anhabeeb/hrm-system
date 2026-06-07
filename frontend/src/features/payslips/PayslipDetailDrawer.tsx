import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/safe-display";
import { payslipsApi } from "./payslips.api";
import type { Payslip, PayslipLine } from "./payslips.types";

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

const formatMoney = (value: unknown, currency = "MVR") => {
  const amount = Number(value ?? 0) / 100;
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const value = (record: Record<string, unknown> | undefined, key: string, fallback?: unknown) => record?.[key] ?? fallback;

const LineTable = ({ title, rows, currency }: { title: string; rows?: PayslipLine[]; currency: string }) => (
  <section className="rounded-lg border bg-card">
    <div className="border-b px-4 py-3">
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Description</th>
            <th className="px-4 py-2 text-left">Source</th>
            <th className="px-4 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows?.length ? rows.map((row, index) => (
            <tr key={row.id ?? `${row.type}-${index}`} className="border-t">
              <td className="px-4 py-2">{row.description ?? row.calculation_code ?? row.type ?? "Line item"}</td>
              <td className="px-4 py-2 text-muted-foreground">{row.source_reference ?? row.source_type ?? "Snapshot"}</td>
              <td className="px-4 py-2 text-right font-medium">{formatMoney(row.amount, currency)}</td>
            </tr>
          )) : (
            <tr className="border-t">
              <td className="px-4 py-3 text-muted-foreground" colSpan={3}>No lines recorded.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </section>
);

export const PayslipDetailDrawer = ({
  payslip,
  open,
  onOpenChange,
}: {
  payslip: Payslip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const employee = payslip?.employee;
  const company = payslip?.company;
  const period = payslip?.payroll_period;
  const totals = payslip?.totals;
  const currency = String(value(totals, "currency", value(period, "currency", "MVR")));
  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={String(value(employee, "name", payslip?.employee_name ?? "Payslip"))}
      subtitle={payslip ? payrollLabel(payslip) : undefined}
      footer={payslip ? (
        <Button className="w-full" onClick={() => window.open(payslipsApi.printUrl(payslip.id), "_blank", "noopener,noreferrer")}>
          Print / save as PDF
        </Button>
      ) : null}
    >
      {payslip ? (
        <>
          <DetailSection
            title="Payslip snapshot"
            rows={[
              { label: "Company", value: String(value(company, "name", "Company")) },
              { label: "Employee", value: `${value(employee, "name", payslip.employee_name ?? "")} (${value(employee, "code", payslip.employee_code ?? "No code")})` },
              { label: "Outlet", value: String(value(employee, "outlet_name", payslip.outlet_name ?? payslip.outlet_id ?? "Unassigned")) },
              { label: "Department", value: String(value(employee, "department_name", "Not recorded")) },
              { label: "Position", value: String(value(employee, "position_name", "Not recorded")) },
              { label: "Payroll period", value: `${value(period, "period_start", "")} to ${value(period, "period_end", "")}` },
              { label: "Status", value: <StatusBadge status={payslip.status ?? "pending"} /> },
              { label: "Generated", value: formatDateTime(payslip.generated_at ?? payslip.created_at) },
              { label: "Finalized", value: formatDateTime(payslip.finalized_at ?? payslip.published_at) },
            ]}
          />
          <DetailSection
            title="Totals"
            rows={[
              { label: "Basic salary", value: formatMoney(value(totals, "basic_salary_amount"), currency) },
              { label: "Payable basic", value: formatMoney(value(totals, "payable_basic_amount"), currency) },
              { label: "Gross salary", value: formatMoney(value(totals, "gross_amount"), currency) },
              { label: "Total deductions", value: formatMoney(value(totals, "total_deductions_amount"), currency) },
              { label: "Net salary", value: <span className="font-semibold">{formatMoney(value(totals, "net_amount"), currency)}</span> },
            ]}
          />
          <LineTable title="Earnings" rows={payslip.earnings} currency={currency} />
          <LineTable title="Deductions" rows={payslip.deductions} currency={currency} />
          <LineTable title="Non-cash benefits" rows={payslip.non_cash_benefits} currency={currency} />
          <DetailSection
            title="Traceability"
            rows={[
              { label: "Payroll run", value: payslip.payroll_run_id ?? "Not recorded" },
              { label: "Payroll item", value: payslip.payroll_item_id ?? "Not recorded" },
              { label: "Calculation version", value: String(value(period, "calculation_version", payslip.calculation_version ?? "Not recorded")) },
              { label: "Printed", value: `${payslip.printed_count ?? 0} time(s)` },
              { label: "Downloaded", value: `${payslip.download_count ?? 0} time(s)` },
            ]}
          />
        </>
      ) : null}
    </DetailDrawer>
  );
};
