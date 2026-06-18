import { Link } from "react-router-dom";
import { ArrowRight, ShieldAlert } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SelfDashboardWidget, SelfProfile, SelfRequest } from "./self-service.types";

export const NotLinkedEmployeeState = () => (
  <div className="overflow-hidden rounded-lg border bg-card">
    <EmptyState
      title="Your employee profile is not linked to this login."
      description="Please contact HR so they can link your login to your employee profile."
      icon={<ShieldAlert className="h-8 w-8" />}
    />
  </div>
);

export const WidgetCard = ({ widget }: { widget: SelfDashboardWidget }) => (
  <Card className={!widget.enabled ? "opacity-70" : undefined}>
    <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
      <CardTitle className="text-sm">{widget.title}</CardTitle>
      <StatusBadge status={widget.status} />
    </CardHeader>
    <CardContent className="space-y-3">
      <div>
        <p className="text-2xl font-semibold tracking-tight">{widget.value ?? (widget.enabled ? "-" : "Disabled")}</p>
        {widget.description ? <p className="text-xs text-muted-foreground">{widget.description}</p> : null}
      </div>
      {widget.rows?.length ? (
        <dl className="space-y-1 text-xs">
          {widget.rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium">{row.value ?? "-"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {widget.href && widget.enabled ? (
        <Button asChild size="sm" variant="outline">
          <Link to={widget.href}>Open <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      ) : null}
    </CardContent>
  </Card>
);

export const ProfileSummaryTable = ({ profile }: { profile: SelfProfile }) => (
  <div className="space-y-3">
    <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/20 p-3">
      <EmployeeAvatar
        name={profile.employee?.full_name ?? profile.user.full_name}
        employeeCode={profile.employee?.employee_code}
        photoUrl={profile.employee?.profile_photo_url}
        size="lg"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{profile.employee?.full_name ?? profile.user.full_name ?? "Employee"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {profile.employee?.employee_code ?? "No employee code"} · {profile.employee?.department_name ?? "Unassigned department"}
        </p>
      </div>
    </div>
    <DataTable
      compact
      columns={[
        { key: "label", header: "Profile field" },
        { key: "value", header: "Value" },
      ]}
      rows={[
        { id: "name", label: "Name", value: profile.employee?.full_name ?? profile.user.full_name ?? "-" },
        { id: "code", label: "Employee code", value: profile.employee?.employee_code ?? "-" },
        { id: "department", label: "Department", value: profile.employee?.department_name ?? "Unassigned" },
        { id: "position", label: "Position / title", value: profile.employee?.position_title ?? "Unassigned" },
        { id: "level", label: "Level", value: profile.employee?.level ? `Level ${profile.employee.level}` : "Unassigned" },
        { id: "outlet", label: "Outlet / store", value: profile.employee?.outlet_name ?? "Unassigned" },
        { id: "employment", label: "Employment status", value: profile.employee?.employment_status ?? "-" },
        { id: "nationality", label: "Nationality", value: profile.employee?.nationality ?? "-" },
        { id: "username", label: "Login username", value: profile.user.username ?? "-" },
        { id: "email", label: "Login email", value: profile.user.email ?? "-" },
        { id: "roles", label: "Roles", value: profile.roles.join(", ") || "-" },
      ]}
      getRowId={(row) => row.id}
    />
  </div>
);

export const RequestsTable = ({
  rows,
  loading,
  emptyTitle = "No requests found.",
  onViewApprovalChain,
}: {
  rows: SelfRequest[];
  loading?: boolean;
  emptyTitle?: string;
  onViewApprovalChain?: (row: SelfRequest) => void;
}) => (
  <DataTable
    compact
    columns={[
      { key: "operation_type", header: "Request type" },
      { key: "title", header: "Title / summary", cell: (row) => <div><p className="font-medium">{row.title}</p><p className="text-xs text-muted-foreground">{row.summary ?? row.subject_type}</p></div> },
      { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
      { key: "current_step_name", header: "Current step", cell: (row) => row.current_step_name ?? "Not started" },
      { key: "updated_at", header: "Updated", cell: (row) => row.updated_at ?? row.created_at ?? "-" },
    ]}
    rows={rows}
    loading={loading}
    getRowId={(row) => row.id}
    rowActions={onViewApprovalChain ? (row) => (
      <RowActions actions={[{ key: "view", label: "View Progress", onSelect: () => onViewApprovalChain(row) }]} />
    ) : undefined}
    emptyTitle={emptyTitle}
    emptyDescription="No pending requests at the moment."
  />
);
