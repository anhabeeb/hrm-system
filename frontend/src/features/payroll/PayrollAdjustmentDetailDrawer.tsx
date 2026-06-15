import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { PayrollAdjustment } from "./payroll.types";

interface Props {
  adjustment: PayrollAdjustment | null;
  timeline?: { steps?: Array<Record<string, unknown>>; actions?: Array<Record<string, unknown>> } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatAmount = (value?: number | null, currency = "MVR") =>
  value == null ? "-" : new Intl.NumberFormat("en-MV", { style: "currency", currency, minimumFractionDigits: 2 }).format(value);

export const PayrollAdjustmentDetailDrawer = ({ adjustment, timeline, open, onOpenChange }: Props) => (
  <DetailDrawer
    open={open}
    onOpenChange={onOpenChange}
    title={adjustment ? humanize(adjustment.adjustment_type) : "Payroll adjustment"}
    subtitle={adjustment?.employee_name ?? adjustment?.employee_id}
  >
    {adjustment ? (
      <>
        <DetailSection
          title="Adjustment summary"
          rows={[
            { label: "Status", value: <Badge variant={adjustment.status === "APPLIED" ? "success" : adjustment.status.includes("PENDING") ? "warning" : "outline"}>{humanize(adjustment.status)}</Badge> },
            { label: "Employee", value: `${adjustment.employee_name ?? adjustment.employee_id}${adjustment.employee_code ? ` (${adjustment.employee_code})` : ""}` },
            { label: "Department", value: adjustment.department_name ?? "-" },
            { label: "Position", value: adjustment.position_title ?? "-" },
            { label: "Amount", value: adjustment.amount == null ? "-" : `${adjustment.adjustment_direction === "DEDUCT" ? "-" : ""}${formatAmount(Number(adjustment.amount), adjustment.currency ?? "MVR")}` },
            { label: "Payroll month", value: adjustment.effective_payroll_month ?? "-" },
            { label: "Payroll run", value: adjustment.payroll_run_id ?? "-" },
            { label: "Reason", value: adjustment.reason },
            { label: "Error", value: adjustment.apply_error_message ?? "-" },
          ]}
        />
        <DetailSection
          title="Approval timeline"
          rows={(timeline?.steps?.length ? timeline.steps : [{ step_name: "No approval steps recorded yet.", status: "DRAFT" }]).map((step, index) => ({
            label: String(step.step_name ?? `Step ${index + 1}`),
            value: `${humanize(String(step.status ?? "pending"))}${step.approved_at ? ` at ${formatDateTime(String(step.approved_at))}` : ""}${step.rejected_at ? ` at ${formatDateTime(String(step.rejected_at))}` : ""}`,
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
