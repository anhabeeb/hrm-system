import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { EmployeeStructureChangeItem, EmployeeStructureChangeRequest, EmployeeStructureChangeTimeline } from "./employeeStructureChange.types";

interface Props {
  request: EmployeeStructureChangeRequest | null;
  timeline?: EmployeeStructureChangeTimeline | null;
  items?: EmployeeStructureChangeItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusVariant = (status?: string | null) =>
  status === "APPLIED" || status === "APPROVED" ? "success" :
    status === "REJECTED" || status === "FAILED_TO_APPLY" ? "destructive" :
      status === "PENDING_MANUAL_REVIEW" || status?.startsWith("PENDING") ? "warning" :
        "outline";

const structureLabel = (department?: string | null, position?: string | null, level?: number | null) =>
  `${department ?? "Unassigned"} / ${position ?? "Unassigned"} / Level ${level ?? "-"}`;

export const EmployeeStructureChangeDetailDrawer = ({ request, timeline, items = [], open, onOpenChange }: Props) => (
  <DetailDrawer
    open={open}
    onOpenChange={onOpenChange}
    title={request ? humanize(request.request_type) : "Employee structure change"}
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
            { label: "Reason", value: request.reason },
            { label: "Apply error", value: request.apply_error_message ?? "-" },
          ]}
        />
        <DetailSection
          title="Current vs requested structure"
          rows={(items.length ? items.map((item) => ({
            label: humanize(item.field_name),
            value: `${item.previous_value ?? "-"} -> ${item.requested_value ?? "-"}`,
          })) : [
            { label: "Current", value: structureLabel(request.current_department_name, request.current_position_title, request.current_level) },
            { label: "Requested", value: structureLabel(request.requested_department_name ?? request.requested_department_id, request.requested_position_title ?? request.requested_position_id, request.requested_level) },
            { label: "Requested outlet/store", value: request.requested_outlet_id ?? "No outlet/store change" },
            { label: "Role template", value: request.apply_role_template ? "Apply missing level-template roles after approval" : "No role template change" },
          ])}
        />
        <DetailSection
          title="Approval timeline"
          rows={(timeline?.steps?.length ? timeline.steps : [{ step_name: "No approval steps recorded yet.", status: request.status }]).map((step, index) => ({
            label: String(step.step_name ?? step.step_code ?? `Step ${index + 1}`),
            value: `${humanize(String(step.status ?? "pending"))}${step.approved_at ? ` at ${formatDateTime(String(step.approved_at))}` : ""}${step.rejected_at ? ` at ${formatDateTime(String(step.rejected_at))}` : ""}${step.skipped_at ? ` at ${formatDateTime(String(step.skipped_at))}` : ""}${step.fallback_applied ? ` · ${humanize(String(step.fallback_applied))}` : ""}`,
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
