import { Badge } from "@/components/ui/badge";
import { DetailDrawer } from "@/components/data/DetailDrawer";
import { formatDateTime } from "@/lib/safe-display";
import type { DisciplinaryAction, DisciplinaryTask, DisciplinaryTimeline } from "./discipline.types";

const humanize = (value?: string | null) => value ? value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) : "-";
const statusVariant = (status?: string | null) =>
  status === "CLOSED" || status === "APPLIED" || status === "ACKNOWLEDGED" ? "success" :
    status === "REJECTED" || status === "FAILED_TO_APPLY" ? "destructive" :
      status === "CANCELLED" ? "muted" :
        status?.includes("PENDING") || status === "APPROVED" ? "warning" :
          "outline";

const DetailSection = ({ title, rows }: { title: string; rows: Array<{ label: string; value: unknown }> }) => (
  <section className="rounded-md border">
    <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{title}</div>
    <div className="divide-y text-sm">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-3 gap-3 px-3 py-2">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="col-span-2">{String(row.value ?? "-")}</span>
        </div>
      ))}
    </div>
  </section>
);

interface Props {
  request: DisciplinaryAction | null;
  timeline?: DisciplinaryTimeline | null;
  tasks?: DisciplinaryTask[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DisciplinaryActionDetailDrawer = ({ request, timeline, tasks = [], open, onOpenChange }: Props) => {
  const visibleTasks = tasks.length ? tasks : timeline?.tasks ?? [];
  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={request?.title ?? "Disciplinary action"}
      subtitle={request?.employee_name ?? request?.employee_id}
    >
      {request ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={statusVariant(request.status) as any}>{humanize(request.status)}</Badge>
            <Badge variant={request.severity === "HIGH" || request.severity === "CRITICAL" ? "destructive" : "outline"}>{humanize(request.severity)}</Badge>
          </div>
          <DetailSection
            title="Request summary"
            rows={[
              { label: "Employee", value: request.employee_name ?? request.employee_id },
              { label: "Department", value: request.department_name ?? "-" },
              { label: "Position", value: request.position_title ?? "-" },
              { label: "Level", value: request.level ?? "-" },
              { label: "Request type", value: humanize(request.request_type) },
              { label: "Recommended outcome", value: humanize(request.action_type) },
              { label: "Incident date", value: request.incident_date ?? "-" },
              { label: "Policy reference", value: request.policy_reference ?? "-" },
              { label: "Description", value: request.description },
              { label: "Evidence summary", value: request.evidence_summary ?? "No evidence metadata recorded." },
            ]}
          />
          <DetailSection
            title="Approval timeline"
            rows={(timeline?.steps?.length ? timeline.steps : [{ step_name: "No approval steps recorded yet.", status: request.status }]).map((step, index) => ({
              label: String(step.step_name ?? step.step_code ?? `Step ${index + 1}`),
              value: `${humanize(String(step.status ?? "PENDING"))}${step.approved_at ? ` at ${formatDateTime(String(step.approved_at))}` : ""}`,
            }))}
          />
          <DetailSection
            title="Follow-up tasks"
            rows={visibleTasks.length
              ? visibleTasks.map((task) => ({
                  label: task.task_name ?? humanize(task.task_type),
                  value: `${humanize(task.status)}${task.required ? " / required" : " / optional"}${task.completed_at ? ` at ${formatDateTime(task.completed_at)}` : ""}`,
                }))
              : [{ label: "No tasks", value: "No disciplinary follow-up tasks assigned to you." }]}
          />
          <DetailSection
            title="Disciplinary record and acknowledgement"
            rows={[
              { label: "Official record", value: timeline?.disciplinary_record ? `${humanize(timeline.disciplinary_record.status)} / ${formatDateTime(timeline.disciplinary_record.applied_at)}` : "No official record applied yet" },
              { label: "Acknowledgement", value: request.acknowledgement_required ? request.acknowledged_at ? `Acknowledged at ${formatDateTime(request.acknowledged_at)}` : "Required" : "Not required" },
              { label: "Follow-up status", value: humanize(request.follow_up_status) },
              { label: "Apply error", value: request.apply_error_message ?? "-" },
              { label: "Rejection reason", value: request.rejection_reason ?? "-" },
              { label: "Cancellation reason", value: request.cancellation_reason ?? "-" },
            ]}
          />
        </div>
      ) : null}
    </DetailDrawer>
  );
};
