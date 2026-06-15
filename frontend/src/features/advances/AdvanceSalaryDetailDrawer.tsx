import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, humanize } from "@/lib/safe-display";
import type { AdvanceSalaryRequest } from "./advances.types";

interface Props {
  request: AdvanceSalaryRequest | null;
  timeline?: { steps?: Array<Record<string, unknown>>; actions?: Array<Record<string, unknown>>; deductions?: Array<Record<string, unknown>> } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusVariant = (status?: string | null) =>
  status === "PAID" || status === "FULLY_DEDUCTED" ? "success" :
    status === "REJECTED" || status === "FAILED_TO_PAY" ? "destructive" :
      status === "CANCELLED" ? "muted" :
        status?.includes("PENDING") || status === "APPROVED" ? "warning" :
          "outline";

const formatDeductionAmount = (value: unknown, currency = "MVR") => {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? <MoneyAmount amount={amount} currency={currency} /> : "-";
};

export const AdvanceSalaryDetailDrawer = ({ request, timeline, open, onOpenChange }: Props) => {
  const deductions = timeline?.deductions ?? [];
  const paidWithoutSchedule = request?.status === "PAID" && deductions.length === 0;
  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={request ? humanize(request.request_type) : "Advance salary request"}
      subtitle={request?.employee_name ?? request?.employee_id}
    >
      {request ? (
        <>
        <DetailSection
          title="Request summary"
          rows={[
            { label: "Status", value: <Badge variant={statusVariant(request.status) as any}>{humanize(request.status)}</Badge> },
            ...(paidWithoutSchedule ? [{ label: "Schedule review", value: <span className="text-sm font-medium text-amber-700">Payment is recorded but deduction schedule needs review.</span> }] : []),
            { label: "Employee", value: `${request.employee_name ?? request.employee_id}${request.employee_code ? ` (${request.employee_code})` : ""}` },
            { label: "Department", value: request.department_name ?? "-" },
            { label: "Position", value: request.position_title ?? "-" },
            { label: "Requested amount", value: <MoneyAmount amount={request.requested_amount} currency={request.currency ?? "MVR"} /> },
            { label: "Approved amount", value: request.approved_amount == null ? "-" : <MoneyAmount amount={request.approved_amount} currency={request.currency ?? "MVR"} /> },
            { label: "Paid amount", value: request.paid_amount == null ? "-" : <MoneyAmount amount={request.paid_amount} currency={request.currency ?? "MVR"} /> },
            { label: "Repayment start", value: request.repayment_start_month ?? "-" },
            { label: "Repayment months", value: request.repayment_months ?? "-" },
            { label: "Monthly deduction", value: request.repayment_amount_per_month == null ? "-" : <MoneyAmount amount={request.repayment_amount_per_month} currency={request.currency ?? "MVR"} /> },
            { label: "Requested payment date", value: formatDate(request.requested_payment_date) },
            { label: "Actual payment date", value: formatDate(request.actual_payment_date) },
            { label: "Reason", value: request.reason },
            { label: "Error", value: request.payment_error_message ?? "-" },
          ]}
        />
        <DetailSection
          title="Approval timeline"
          rows={(timeline?.steps?.length ? timeline.steps : [{ step_name: "No approval steps recorded yet.", status: request.status }]).map((step, index) => ({
            label: String(step.step_name ?? `Step ${index + 1}`),
            value: `${humanize(String(step.status ?? "pending"))}${step.approved_at ? ` at ${formatDateTime(String(step.approved_at))}` : ""}${step.rejected_at ? ` at ${formatDateTime(String(step.rejected_at))}` : ""}${step.skipped_at ? ` at ${formatDateTime(String(step.skipped_at))}` : ""}`,
          }))}
        />
        <DetailSection
          title="Deduction schedule"
          rows={(deductions.length ? deductions : [{ payroll_month: "No deduction schedule recorded yet.", status: request.deduction_status ?? "NOT_SCHEDULED" }]).map((deduction, index) => ({
            label: String(deduction.payroll_month ?? `Deduction ${index + 1}`),
            value: (
              <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>Status: {humanize(String(deduction.status ?? "scheduled"))}</span>
                  <span>Scheduled: {formatDeductionAmount(deduction.scheduled_amount, request.currency ?? "MVR")}</span>
                  <span>Deducted: {formatDeductionAmount(deduction.deducted_amount, request.currency ?? "MVR")}</span>
                </div>
                {deduction.payroll_run_id || deduction.payslip_id ? (
                  <div className="text-xs text-muted-foreground">
                    Payroll run: {String(deduction.payroll_run_id ?? "-")} · Payslip: {String(deduction.payslip_id ?? "-")}
                  </div>
                ) : null}
              </div>
            ),
          }))}
        />
        <DetailSection
          title="Actions"
          rows={(timeline?.actions?.length ? timeline.actions.slice(0, 8) : [{ action: "No approval actions recorded yet." }]).map((action, index) => ({
            label: String(action.action ?? `Action ${index + 1}`),
            value: `${action.reason ? `${action.reason} - ` : ""}${formatDateTime(action.created_at as string | undefined)}`,
          }))}
        />
        </>
      ) : null}
    </DetailDrawer>
  );
};
