import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { EmployeeExitRequest, EmployeeExitTask, EmployeeExitTimeline } from "./employeeExit.types";

interface Props {
  request: EmployeeExitRequest | null;
  timeline?: EmployeeExitTimeline | null;
  tasks?: EmployeeExitTask[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusVariant = (status?: string | null) =>
  status === "APPLIED" || status === "APPROVED" || status === "COMPLETED" ? "success" :
    status === "REJECTED" || status === "FAILED_TO_APPLY" ? "destructive" :
      status === "PENDING_MANUAL_REVIEW" || status?.startsWith("PENDING") || status === "OFFBOARDING_IN_PROGRESS" ? "warning" :
        "outline";

export const EmployeeExitDetailDrawer = ({ request, timeline, tasks = [], open, onOpenChange }: Props) => (
  <DetailDrawer
    open={open}
    onOpenChange={onOpenChange}
    title={request ? humanize(request.request_type) : "Resignation / Offboarding"}
    subtitle={request?.employee_name ?? request?.employee_id}
  >
    {request ? (
      <>
        <DetailSection
          title="Request summary"
          rows={[
            { label: "Status", value: <Badge variant={statusVariant(request.status) as any}>{humanize(request.status)}</Badge> },
            { label: "Approval status", value: request.approval_status ? <Badge variant={statusVariant(request.approval_status) as any}>{humanize(request.approval_status)}</Badge> : "-" },
            { label: "Employee", value: `${request.employee_name ?? request.employee_id}${request.employee_code ? ` (${request.employee_code})` : ""}` },
            { label: "Operation", value: humanize(request.operation_type) },
            { label: "Department / position", value: `${request.department_name ?? "Unassigned"} / ${request.position_title ?? "Unassigned"} / L${request.level ?? "-"}` },
            { label: "Reason", value: request.reason },
            { label: "Apply error", value: request.apply_error_message ?? "-" },
            { label: "Execution note", value: request.execution_note ?? "-" },
          ]}
        />
        <DetailSection
          title="Lifecycle dates and handoffs"
          rows={[
            { label: "Resignation date", value: request.resignation_date ?? "-" },
            { label: "Requested last working date", value: request.requested_last_working_date ?? "-" },
            { label: "Approved last working date", value: request.approved_last_working_date ?? "-" },
            { label: "Checklist", value: humanize(request.offboarding_checklist_status ?? "not generated") },
            { label: "Final settlement", value: humanize(request.final_settlement_status ?? "pending") },
            { label: "Access disable", value: humanize(request.access_disable_status ?? "pending") },
          ]}
        />
        <DetailSection
          title="Offboarding tasks"
          rows={(tasks.length ? tasks : timeline?.tasks ?? []).length
            ? (tasks.length ? tasks : timeline?.tasks ?? []).map((task) => ({
                label: task.task_name ?? task.title ?? humanize(task.task_type),
                value: `${humanize(task.status)}${task.required ? " / required" : " / optional"}${task.completed_at ? ` at ${formatDateTime(task.completed_at)}` : ""}`,
              }))
            : [{ label: "No tasks", value: "No offboarding tasks assigned to you." }]}
        />
        <DetailSection
          title="Approval timeline"
          rows={(timeline?.steps?.length ? timeline.steps : [{ step_name: "No approval steps recorded yet.", status: request.status }]).map((step, index) => ({
            label: String(step.step_name ?? step.step_code ?? `Step ${index + 1}`),
            value: `${humanize(String(step.status ?? "pending"))}${step.approved_at ? ` at ${formatDateTime(String(step.approved_at))}` : ""}${step.rejected_at ? ` at ${formatDateTime(String(step.rejected_at))}` : ""}${step.skipped_at ? ` at ${formatDateTime(String(step.skipped_at))}` : ""}${step.fallback_applied ? ` - ${humanize(String(step.fallback_applied))}` : ""}`,
          }))}
        />
        <DetailSection
          title="Audit actions"
          rows={(timeline?.actions?.length ? timeline.actions.slice(0, 8) : [{ action: "No approval actions recorded yet." }]).map((action, index) => ({
            label: String(action.action ?? `Action ${index + 1}`),
            value: `${action.reason ? `${action.reason} - ` : ""}${formatDateTime(action.created_at as string | undefined)}`,
          }))}
        />
      </>
    ) : null}
  </DetailDrawer>
);
