import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { StatusBadge } from "@/components/data/StatusBadge";
import { useAttendanceSubFeatures } from "@/features/attendance/useAttendanceSubFeatures";
import { usePayrollSubFeatures } from "./usePayrollSubFeatures";
import type { PayrollItem } from "./payroll.types";

type PayrollMetadata = {
  payroll_month?: string;
  period_start?: string;
  period_end?: string;
  salary_segments?: Array<{
    salary_record_id?: string;
    segment_start?: string;
    segment_end?: string;
    monthly_salary_amount?: number;
    daily_rate?: number;
    payable_days?: number;
    segment_total?: number;
  }>;
  compensation_summary?: Record<string, number>;
  compensation_components?: Array<{
    component_id?: string;
    component_name?: string;
    component_type?: string;
    calculation_type?: string;
    amount?: number;
    gross_effect?: string;
    net_effect?: string;
    effective_from?: string;
    effective_to?: string | null;
  }>;
  leave_summary?: Array<{
    leave_request_id?: string;
    leave_type_id?: string | null;
    start_date?: string;
    end_date?: string;
    is_paid?: boolean;
    affects_payroll?: boolean;
  }>;
  advance_sources?: Array<{ advance_id?: string; deduction_month?: string; amount?: number }>;
  loan_sources?: Array<{ installment_id?: string; salary_loan_id?: string; amount?: number }>;
  asset_deduction_sources?: Array<{ asset_deduction_id?: string; amount?: number }>;
  classification_counts?: Record<string, number>;
  warnings?: Array<{ warning_type?: string; message?: string }>;
};

const parseMetadata = (value?: string | null): PayrollMetadata => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const formatLabel = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase());

const AmountLine = ({ label, amount }: { label: string; amount?: number }) => (
  <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
    <span className="text-muted-foreground">{label}</span>
    <MoneyAmount amount={amount ?? 0} />
  </div>
);

const CountLine = ({ label, count }: { label: string; count?: number }) => (
  <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium">{count ?? 0}</span>
  </div>
);

export const PayrollItemDetailDrawer = ({
  item,
  open,
  onOpenChange,
}: {
  item: PayrollItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const attendanceSubFeatures = useAttendanceSubFeatures();
  const payrollSubFeatures = usePayrollSubFeatures();
  const metadata = parseMetadata(item?.calculation_metadata_json);
  const compensation = metadata.compensation_summary ?? {};
  const components = metadata.compensation_components ?? [];
  const leaveSummary = metadata.leave_summary ?? [];
  const attendance = metadata.classification_counts ?? {};
  const salarySegments = metadata.salary_segments ?? [];

  return (
    <DetailDrawer open={open} onOpenChange={onOpenChange} title={item?.employee_name ?? "Payroll item"} subtitle={item?.employee_code ?? item?.employee_id}>
      {item ? (
        <div className="space-y-4">
          <DetailSection
            title="Payroll row"
            rows={[
              { label: "Outlet", value: item.outlet_name ?? item.outlet_id ?? "Unassigned" },
              { label: "Gross", value: <MoneyAmount amount={item.gross_amount ?? item.total_earnings_amount} /> },
              { label: "Deductions", value: <MoneyAmount amount={item.total_deductions_amount} /> },
              { label: "Net", value: <MoneyAmount amount={item.net_amount} /> },
              { label: "Status", value: <StatusBadge status={item.status ?? "draft"} /> },
              ...(payrollSubFeatures.payslipsEnabled ? [{ label: "Payslip", value: <StatusBadge status={item.payslip_status ?? "pending"} /> }] : []),
              { label: "Calculation code", value: item.calculation_code ?? "Not recorded" },
              { label: "Explanation", value: item.calculation_description ?? "No calculation explanation recorded." },
            ]}
          />

          <DetailSection
            title="Salary segments"
            rows={[
              {
                label: "Segments",
                value: salarySegments.length ? (
                  <div className="space-y-2">
                    {salarySegments.map((segment, index) => (
                      <div key={`${segment.salary_record_id ?? "salary"}-${index}`} className="rounded-md border p-3">
                        <div className="font-medium">{segment.segment_start} to {segment.segment_end}</div>
                        <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                          <AmountLine label="Monthly salary" amount={segment.monthly_salary_amount} />
                          <AmountLine label="Daily rate" amount={segment.daily_rate} />
                          <CountLine label="Payable days" count={segment.payable_days} />
                          <AmountLine label="Segment total" amount={segment.segment_total} />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">Salary record: {segment.salary_record_id ?? "Not recorded"}</div>
                      </div>
                    ))}
                  </div>
                ) : "No salary segment metadata recorded.",
              },
            ]}
          />

          <DetailSection
            title="Compensation components"
            rows={[
              {
                label: "Gross and net effects",
                value: (
                  <div className="grid gap-2 md:grid-cols-2">
                    <AmountLine label="Gross additions" amount={compensation.recurring_gross_additions} />
                    <AmountLine label="Gross deductions" amount={compensation.recurring_gross_deductions} />
                    <AmountLine label="Net additions" amount={compensation.recurring_net_additions} />
                    <AmountLine label="Net deductions" amount={compensation.recurring_net_deductions} />
                    {payrollSubFeatures.benefitsEnabled ? <AmountLine label="Non-cash benefits" amount={compensation.non_cash_benefits} /> : null}
                  </div>
                ),
              },
              {
                label: "Component lines",
                value: components.length ? (
                  <div className="space-y-2">
                    {components.map((component, index) => (
                      <div key={`${component.component_id ?? "component"}-${index}`} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{component.component_name ?? "Compensation component"}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatLabel(component.component_type ?? "component")} · {formatLabel(component.calculation_type ?? "fixed_amount")}
                            </div>
                          </div>
                          <MoneyAmount amount={component.amount ?? 0} />
                        </div>
                        <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                          <div className="rounded-md border px-3 py-2">
                            <span className="text-muted-foreground">Gross effect: </span>
                            <span className="font-medium">{formatLabel(component.gross_effect ?? "none")}</span>
                          </div>
                          <div className="rounded-md border px-3 py-2">
                            <span className="text-muted-foreground">Net effect: </span>
                            <span className="font-medium">{formatLabel(component.net_effect ?? "none")}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Gross: {formatLabel(component.gross_effect ?? "none")} · Net: {formatLabel(component.net_effect ?? "none")} · Effective {component.effective_from ?? "unknown"} to {component.effective_to ?? "open"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">Source: {component.component_id ?? "Not recorded"}</div>
                      </div>
                    ))}
                  </div>
                ) : "No recurring compensation component metadata recorded.",
              },
            ]}
          />

          <DetailSection
            title="Attendance and leave"
            rows={[
              {
                label: "Day classification",
                value: Object.keys(attendance).length ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {Object.entries(attendance).map(([key, count]) => (
                      <CountLine key={key} label={formatLabel(key)} count={count} />
                    ))}
                  </div>
                ) : "No attendance classification metadata recorded.",
              },
              {
                label: "Leave and attendance deductions",
                value: (
                  <div className="grid gap-2 md:grid-cols-2">
                    {attendanceSubFeatures.payrollDeductionsEnabled && payrollSubFeatures.attendanceDeductionsEnabled ? <AmountLine label="Absent-day deductions" amount={compensation.attendance_deductions} /> : null}
                    <AmountLine label="Unpaid leave deductions" amount={compensation.unpaid_leave_deductions} />
                  </div>
                ),
              },
              {
                label: "Leave records",
                value: leaveSummary.length ? (
                  <div className="space-y-2">
                    {leaveSummary.map((leave, index) => (
                      <div key={`${leave.leave_request_id ?? "leave"}-${index}`} className="rounded-md border px-3 py-2">
                        <div className="font-medium">{leave.start_date} to {leave.end_date}</div>
                        <div className="text-xs text-muted-foreground">
                          {leave.is_paid ? "Paid leave" : "Unpaid leave"} · Source request: {leave.leave_request_id ?? "Not recorded"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : "No approved leave records affected this row.",
              },
            ]}
          />

          <DetailSection
            title="Advances, loans, and warnings"
            rows={[
              {
                label: "Repayment deductions",
                value: (
                  <div className="grid gap-2 md:grid-cols-2">
                    {payrollSubFeatures.advancesEnabled ? <AmountLine label="Advances" amount={compensation.advance_deductions} /> : null}
                    {payrollSubFeatures.salaryLoansEnabled ? <AmountLine label="Salary loans" amount={compensation.loan_deductions} /> : null}
                    <AmountLine label="Other deductions" amount={compensation.other_deductions} />
                  </div>
                ),
              },
              {
                label: "Sources",
                value: (
                  <div className="space-y-2">
                    {payrollSubFeatures.advancesEnabled ? metadata.advance_sources?.map((advance, index) => (
                      <div key={`${advance.advance_id ?? "advance"}-${index}`} className="rounded-md border px-3 py-2">
                        Advance {advance.advance_id ?? "Not recorded"} for {advance.deduction_month ?? "this month"}: <MoneyAmount amount={advance.amount ?? 0} />
                      </div>
                    )) : null}
                    {payrollSubFeatures.salaryLoansEnabled ? metadata.loan_sources?.map((loan, index) => (
                      <div key={`${loan.installment_id ?? "loan"}-${index}`} className="rounded-md border px-3 py-2">
                        Loan installment {loan.installment_id ?? "Not recorded"}: <MoneyAmount amount={loan.amount ?? 0} />
                      </div>
                    )) : null}
                    {metadata.asset_deduction_sources?.map((asset, index) => (
                      <div key={`${asset.asset_deduction_id ?? "asset"}-${index}`} className="rounded-md border px-3 py-2">
                        Asset deduction {asset.asset_deduction_id ?? "Not recorded"}: <MoneyAmount amount={asset.amount ?? 0} />
                      </div>
                    ))}
                    {!(payrollSubFeatures.advancesEnabled && metadata.advance_sources?.length) && !(payrollSubFeatures.salaryLoansEnabled && metadata.loan_sources?.length) && !metadata.asset_deduction_sources?.length ? (
                      <span>No advance, loan, or asset deduction source records affected this row.</span>
                    ) : null}
                  </div>
                ),
              },
              {
                label: "Warnings",
                value: metadata.warnings?.length ? (
                  <ul className="space-y-2">
                    {metadata.warnings.map((warning, index) => (
                      <li key={`${warning.warning_type ?? "warning"}-${index}`} className="rounded-md border px-3 py-2">
                        <div className="font-medium">{formatLabel(warning.warning_type ?? "Warning")}</div>
                        <div className="text-muted-foreground">{warning.message ?? "Review this payroll source item."}</div>
                      </li>
                    ))}
                  </ul>
                ) : "No calculation warnings recorded.",
              },
            ]}
          />

          <DetailSection
            title="Calculation metadata"
            rows={[
              { label: "Payroll month", value: metadata.payroll_month ?? "Not recorded" },
              { label: "Period", value: metadata.period_start && metadata.period_end ? `${metadata.period_start} to ${metadata.period_end}` : "Not recorded" },
              { label: "Source type", value: "Generated payroll calculation" },
            ]}
          />
        </div>
      ) : null}
    </DetailDrawer>
  );
};
