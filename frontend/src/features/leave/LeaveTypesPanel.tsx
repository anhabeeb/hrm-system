import { DataTable } from "@/components/data/DataTable";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { LeavePolicy, LeaveType } from "./leave.types";

export const LeaveTypesPanel = ({ types, policies, loading }: { types: LeaveType[]; policies: LeavePolicy[]; loading?: boolean }) => (
  <div className="space-y-4">
    <DataTable rows={types} columns={[
      { key: "name", header: "Leave Type", cell: (row) => row.name ?? row.leave_type_name ?? row.id },
      { key: "default_days", header: "Default Days", cell: (row) => row.default_days ?? "—" },
      { key: "is_paid", header: "Paid", cell: (row) => row.is_paid ? "Yes" : "No" },
      { key: "is_enabled", header: "Status", cell: (row) => <StatusBadge status={row.is_enabled === false || row.is_enabled === 0 ? "disabled" : "active"} /> },
    ]} getRowId={(row) => row.id} loading={loading} compact emptyTitle="No leave types found" />
    <DataTable rows={policies} columns={[
      { key: "policy_name", header: "Policy" },
      { key: "employee_type", header: "Employee Type", cell: (row) => row.employee_type ?? "All" },
      { key: "entitlement_days", header: "Entitlement", cell: (row) => row.entitlement_days ?? 0 },
      { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "neutral"} /> },
    ]} getRowId={(row) => row.id} compact emptyTitle="No leave policies found" />
  </div>
);
