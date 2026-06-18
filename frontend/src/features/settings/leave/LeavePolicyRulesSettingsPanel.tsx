import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { useAuth } from "@/features/auth/auth.store";
import { leaveApi } from "@/features/leave/leave.api";
import { LeavePolicyRuleDialog } from "@/features/leave/LeavePolicyRuleDialog";
import type { LeaveTypePolicyRule, LeaveTypePolicyRuleUpdatePayload } from "@/features/leave/leave.types";
import { friendlyHrmError } from "@/lib/hrm-errors";

export const LeavePolicyRulesSettingsPanel = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [selectedPolicyRule, setSelectedPolicyRule] = useState<LeaveTypePolicyRule | null>(null);
  const [resetPolicyRule, setResetPolicyRule] = useState<LeaveTypePolicyRule | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canManage = auth.hasAnyPermission(["leave_policy_rules.manage", "leave_settings.manage", "leave.settings.manage", "settings.manage"]);
  const policyRulesQuery = useQuery({ queryKey: ["leave", "policy-rules"], queryFn: leaveApi.listPolicyRules });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["leave"] });

  const updatePolicyRuleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LeaveTypePolicyRuleUpdatePayload }) => leaveApi.updatePolicyRule(id, payload),
    onSuccess: async () => {
      setSuccessMessage("Leave policy rule updated.");
      setSelectedPolicyRule(null);
      await refresh();
    },
  });

  const resetPolicyRuleMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => leaveApi.resetPolicyRule(id, reason),
    onSuccess: async () => {
      setSuccessMessage("Leave policy rule reset to default.");
      setResetPolicyRule(null);
      await refresh();
    },
  });

  const error = policyRulesQuery.error ?? updatePolicyRuleMutation.error ?? resetPolicyRuleMutation.error;

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm" data-setup-target="leave-policy-rules">
      {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
      {error ? <InlineAlert title={friendlyHrmError(error, "Leave policy rules could not be loaded.", "leave")} variant="error" /> : null}
      <div className="mb-4">
        <h2 className="text-base font-semibold">Leave Policy Rules</h2>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          Configure document requirements, salary deduction rules, allowance/pay component deductions, approval behavior, and entitlement rules for each leave type.
        </p>
      </div>
      <div className="mb-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-md border bg-muted/20 p-3" data-setup-target="leave-document-rules">
          <p className="font-medium">Document rules</p>
          <p className="mt-1 text-muted-foreground">Control when leave requests require supporting documents, including consecutive-day and used-day thresholds.</p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3" data-setup-target="leave-deduction-rules">
          <p className="font-medium">Deduction rules</p>
          <p className="mt-1 text-muted-foreground">Choose whether deductions use basic salary, selected allowances, selected pay components, or no deduction.</p>
        </div>
      </div>
      <DataTable
        rows={policyRulesQuery.data?.data.policy_rules ?? []}
        columns={[
          { key: "leave_type_name", header: "Leave type", cell: (row) => row.leave_type_name ?? row.leave_type_id },
          { key: "annual_entitlement_days", header: "Entitlement days", cell: (row) => row.annual_entitlement_days ?? "-" },
          { key: "paid_status", header: "Paid status", cell: (row) => `${row.paid_status ?? "paid"} (${row.paid_percentage ?? 100}%)` },
          { key: "deduction_mode", header: "Deduction", cell: (row) => row.salary_deduction_enabled ? row.deduction_mode : "none" },
          { key: "deduction_source", header: "Deduction source", cell: (row) => row.salary_deduction_enabled ? (row.payroll_source_label ?? row.deduction_component ?? "Policy") : "No deduction" },
          { key: "document_requirement", header: "Document rule", cell: (row) => row.document_required_mode ?? row.document_requirement ?? "never" },
          { key: "approval_required", header: "Approval required", cell: (row) => row.approval_required ? "Required" : "Not required" },
          { key: "is_enabled", header: "Status", cell: (row) => <StatusBadge status={row.is_enabled === false || row.is_enabled === 0 ? "disabled" : "active"} /> },
        ]}
        getRowId={(row) => row.id}
        loading={policyRulesQuery.isLoading}
        compact
        emptyTitle="No leave policy rules found"
        rowActions={(row) => canManage ? (
          <RowActions
            actions={[
              { key: "edit", label: "Edit Policy Rules", onSelect: () => setSelectedPolicyRule(row) },
              { key: row.is_enabled === false || row.is_enabled === 0 ? "enable" : "disable", label: "Enable/disable in editor", onSelect: () => setSelectedPolicyRule(row) },
              { key: "more", label: "Reset to default", onSelect: () => setResetPolicyRule(row) },
            ]}
          />
        ) : null}
      />
      <LeavePolicyRuleDialog
        rule={selectedPolicyRule}
        loading={updatePolicyRuleMutation.isPending}
        error={updatePolicyRuleMutation.error ? friendlyHrmError(updatePolicyRuleMutation.error, "Leave policy rule could not be updated.", "leave") : null}
        onOpenChange={(open) => !open && setSelectedPolicyRule(null)}
        onSubmit={(id, payload) => updatePolicyRuleMutation.mutate({ id, payload })}
      />
      <ReasonDialog
        open={Boolean(resetPolicyRule)}
        title="Reset leave policy rule"
        description={`Reset ${resetPolicyRule?.leave_type_name ?? "this leave type"} to its system default policy. Existing leave requests and payroll records will not be changed.`}
        confirmLabel="Reset to default"
        loading={resetPolicyRuleMutation.isPending}
        error={resetPolicyRuleMutation.error ? friendlyHrmError(resetPolicyRuleMutation.error, "Leave policy rule could not be reset.", "leave") : null}
        onOpenChange={(open) => !open && setResetPolicyRule(null)}
        onSubmit={(reason) => resetPolicyRule && resetPolicyRuleMutation.mutate({ id: resetPolicyRule.id, reason })}
      />
    </section>
  );
};
