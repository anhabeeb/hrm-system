import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { LeavePolicy, LeaveType, LeaveTypePolicyRule } from "./leave.types";

export const LeaveTypesPanel = ({
  types,
  policies,
  policyRules,
  loading,
  canManage,
  onEditType,
  onEditPolicyRule,
  onResetPolicyRule,
}: {
  types: LeaveType[];
  policies: LeavePolicy[];
  policyRules?: LeaveTypePolicyRule[];
  loading?: boolean;
  canManage?: boolean;
  onEditType?: (type: LeaveType) => void;
  onEditPolicyRule?: (rule: LeaveTypePolicyRule) => void;
  onResetPolicyRule?: (rule: LeaveTypePolicyRule) => void;
}) => (
  <div className="space-y-4">
    <div data-setup-target="leave-types">
      <DataTable
      rows={types}
      columns={[
        { key: "name", header: "Leave Type", cell: (row) => row.name ?? row.leave_type_name ?? row.id },
        { key: "default_days", header: "Default Days", cell: (row) => row.default_days ?? "-" },
        { key: "requires_balance", header: "Balance", cell: (row) => row.requires_balance ? "Required" : "Not required" },
        { key: "accrual_frequency", header: "Accrual", cell: (row) => row.accrual_enabled ? (row.accrual_frequency ?? "enabled") : "Off" },
        { key: "carry_forward_enabled", header: "Carry", cell: (row) => row.carry_forward_enabled ? `Yes (${row.carry_forward_limit_days ?? "no limit"})` : "No" },
        { key: "is_paid", header: "Paid", cell: (row) => row.is_paid ? "Yes" : "No" },
        { key: "is_enabled", header: "Status", cell: (row) => <StatusBadge status={row.is_enabled === false || row.is_enabled === 0 ? "disabled" : "active"} /> },
      ]}
      getRowId={(row) => row.id}
      loading={loading}
      compact
      emptyTitle="No leave types found"
      rowActions={(row) => canManage && onEditType ? <RowActions actions={[{ key: "edit", label: "Edit balance settings", onSelect: () => onEditType(row) }]} /> : null}
      />
    </div>
    <div className="space-y-2" data-setup-target="leave-policy-rules">
      <div>
        <h3 className="text-sm font-semibold">Leave policy rules</h3>
        <p className="text-sm text-muted-foreground">Configure document rules, approval behavior, and payroll deduction source by leave type.</p>
      </div>
      <DataTable
        rows={policyRules ?? []}
        columns={[
          { key: "leave_type_name", header: "Leave Type", cell: (row) => row.leave_type_name ?? row.leave_type_id },
          { key: "annual_entitlement_days", header: "Entitlement", cell: (row) => row.annual_entitlement_days ?? "-" },
          { key: "paid_status", header: "Paid Rule", cell: (row) => `${row.paid_status ?? "paid"} (${row.paid_percentage ?? 100}%)` },
          { key: "deduction_mode", header: "Deduction", cell: (row) => row.salary_deduction_enabled ? row.deduction_mode : "none" },
          { key: "deduction_source", header: "Deduction Source", cell: (row) => row.salary_deduction_enabled ? (row.payroll_source_label ?? row.deduction_component ?? "Policy") : "No deduction" },
          { key: "document_requirement", header: "Document Rule", cell: (row) => row.document_required_mode ?? row.document_requirement ?? "never" },
          { key: "approval_required", header: "Approval", cell: (row) => row.approval_required ? "Required" : "Not required" },
          { key: "is_enabled", header: "Status", cell: (row) => <StatusBadge status={row.is_enabled === false || row.is_enabled === 0 ? "disabled" : "active"} /> },
        ]}
        getRowId={(row) => row.id}
        loading={loading}
        compact
        emptyTitle="No leave policy rules found"
        rowActions={(row) => canManage && onEditPolicyRule ? <RowActions actions={[
          { key: "view", label: "View policy", onSelect: () => onEditPolicyRule(row) },
          { key: "edit", label: "Edit policy", onSelect: () => onEditPolicyRule(row) },
          { key: row.is_enabled === false || row.is_enabled === 0 ? "enable" : "disable", label: "Enable/disable in editor", onSelect: () => onEditPolicyRule(row) },
          { key: "more", label: "Reset to default", onSelect: () => onResetPolicyRule?.(row), disabled: !onResetPolicyRule },
        ]} /> : null}
      />
    </div>
    <DataTable
      rows={policies}
      columns={[
        { key: "policy_name", header: "Policy" },
        { key: "employee_type", header: "Employee Type", cell: (row) => row.employee_type ?? "All" },
        { key: "entitlement_days", header: "Entitlement", cell: (row) => row.entitlement_days ?? 0 },
        { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "neutral"} /> },
      ]}
      getRowId={(row) => row.id}
      compact
      emptyTitle="No leave policies found"
    />
  </div>
);
