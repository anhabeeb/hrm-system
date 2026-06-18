import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { LoadingState } from "@/components/data/LoadingState";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { SelfRequest, SelfServiceApprovalChain, SelfServiceApprovalChainStep } from "./self-service.types";

const approverTarget = (step: SelfServiceApprovalChainStep) =>
  [
    step.approver_role_label,
    step.approver_level_label,
    step.approver_department_label,
    step.approver_display_name,
  ].filter(Boolean).join(" - ") || "Approval setup needs review by HR.";

export const SelfServiceApprovalChainDialog = ({
  request,
  open,
  loading,
  error,
  chain,
  onOpenChange,
}: {
  request: SelfRequest | null;
  open: boolean;
  loading?: boolean;
  error?: string | null;
  chain?: SelfServiceApprovalChain | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const policy = chain?.policy_summary ?? null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Approval progress"
      subtitle={request?.title ?? "Request approval chain"}
    >
      {loading ? <LoadingState rows={5} /> : null}
      {error ? <InlineAlert title={error} variant="error" persistent /> : null}
      {chain ? (
        <div className="space-y-4">
          <DetailSection
            title="Request"
            rows={[
              { label: "Request type", value: humanize(chain.request_type) },
              { label: "Status", value: <StatusBadge status={chain.request_status} /> },
              { label: "Current step", value: chain.current_step_label ?? "Not started" },
              { label: "Summary", value: chain.summary ?? request?.summary ?? "-" },
            ]}
          />

          {chain.approval_setup_message ? (
            <InlineAlert title={chain.approval_setup_message} variant="warning" persistent>
              HR can review the approval workflow setup if this request is waiting for manual assignment.
            </InlineAlert>
          ) : null}

          {policy ? (
            <DetailSection
              title="Leave policy impact"
              rows={[
                { label: "Leave type", value: policy.leave_type_name ?? "-" },
                { label: "Dates", value: policy.date_range ?? "-" },
                {
                  label: "Document",
                  value: policy.document_required
                    ? `Required${policy.document_status ? ` - ${humanize(policy.document_status)}` : ""}`
                    : "Not required",
                },
                { label: "Document reason", value: policy.document_required_reason ?? "-" },
                { label: "Payroll impact", value: policy.payroll_impact_label ?? (policy.salary_deduction_required ? "Deduction required" : "No salary deduction") },
                { label: "Deduction source", value: policy.deduction_source_label ?? humanize(policy.deduction_mode) },
                { label: "Policy workflow", value: policy.approval_workflow_key ?? (policy.approval_required === false ? "No approval required by policy" : "-") },
              ]}
            />
          ) : null}

          <section className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Approval chain</h3>
              <p className="mt-1 text-xs text-muted-foreground">Only configured workflow steps are shown. Finance appears only when it is part of this request workflow.</p>
            </div>
            <div className="w-full min-w-0 overflow-hidden">
              <div className="w-full overflow-x-auto">
                <table className="min-w-max w-full text-sm">
                  <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Step</th>
                      <th className="px-4 py-2 text-left">Approver target</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Completed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {chain.approval_chain.map((step) => (
                      <tr key={`${step.step_order}-${step.step_key}`} className={step.is_current_step ? "bg-blue-50/60" : undefined}>
                        <td className="px-4 py-3 align-top">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="font-medium">{step.step_order}. {step.step_label}</span>
                            {step.is_current_step ? <Badge variant="secondary">Current</Badge> : null}
                            {step.is_final_step ? <Badge variant="outline">Final</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{step.resolver_type}</p>
                        </td>
                        <td className="max-w-xs px-4 py-3 align-top">
                          <span className="line-clamp-2">{approverTarget(step)}</span>
                        </td>
                        <td className="px-4 py-3 align-top"><StatusBadge status={step.status} /></td>
                        <td className="px-4 py-3 align-top text-muted-foreground">
                          {step.status === "approved" ? formatDateTime(step.approved_at) : step.status === "rejected" ? formatDateTime(step.rejected_at) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </DetailDrawer>
  );
};
