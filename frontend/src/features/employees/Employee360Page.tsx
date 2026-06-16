import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { LoadingState } from "@/components/data/LoadingState";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { employeesApi } from "./employees.api";
import { EmployeeStatusBadge } from "./EmployeeStatusBadge";
import { EmployeeProfilePhotoControls } from "./EmployeeProfilePhotoControls";
import { EmployeeAttendanceCalendarWidget } from "@/features/attendance-calendar/EmployeeAttendanceCalendarWidget";
import { useAuth } from "@/features/auth/auth.store";

const cellValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const metricRows = (values: Record<string, unknown>) =>
  Object.entries(values).map(([metric, value]) => ({ id: metric, metric, value: cellValue(value) }));

const recordRows = (rows?: Array<Record<string, unknown>> | null) => rows ?? [];

const emergencyContactRows = (employee: {
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
}) => {
  if (!employee.emergency_contact_name && !employee.emergency_contact_phone && !employee.emergency_contact_relation) {
    return [{ metric: "Emergency contact", value: "No emergency contact recorded." }];
  }

  return metricRows({
    Name: employee.emergency_contact_name,
    Phone: employee.emergency_contact_phone,
    Relationship: employee.emergency_contact_relation,
  });
};

const SimpleTable = ({
  title,
  rows,
  columns,
  empty,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  columns: string[];
  empty?: string;
}) => (
  <div className="space-y-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    <DataTable
      compact
      rows={rows}
      columns={columns.map((key) => ({ key, header: key.replace(/_/g, " "), cell: (row: Record<string, unknown>) => cellValue(row[key]) }))}
      getRowId={(row) => String(row.id ?? `${title}-${JSON.stringify(row).slice(0, 80)}`)}
      emptyTitle={empty ?? `No ${title.toLowerCase()} found.`}
    />
  </div>
);

export const Employee360Page = () => {
  const { employeeId } = useParams();
  const auth = useAuth();
  const profileQuery = useQuery({
    queryKey: ["employees", employeeId, "profile"],
    queryFn: () => employeesApi.profile(employeeId ?? "", { limit: 25 }),
    enabled: Boolean(employeeId),
  });
  const profile = profileQuery.data?.data;
  const employee = profile?.summary.employee;
  const warnings = profile?.summary.warnings ?? {};
  const canViewAttendanceCalendar =
    auth.hasFeature("attendance") &&
    auth.hasAnyPermission(["attendance.calendar.view", "attendance.calendar.viewTeam", "attendance.calendar.viewAll", "attendance.view", "attendance.reports.view", "employees.view"]);
  const canManageProfilePhoto = auth.hasAnyPermission(["employees.profilePhoto.upload", "employees.profilePhoto.manage", "employees.edit", "employees.manage"]);

  return (
    <div>
      <PageActionBar label="Employee profile page actions"><div className="flex flex-wrap items-center justify-end gap-2"><Button asChild variant="outline"><Link to="/employees"><ArrowLeft className="h-4 w-4" /> Back to employees</Link></Button></div></PageActionBar>
      <div className="space-y-4 p-4 md:p-6">
        {profileQuery.isLoading ? <LoadingState rows={10} /> : null}
        {profileQuery.isError ? <InlineAlert title="Employee profile could not be loaded." variant="error">Please check your permission and outlet scope, then try again.</InlineAlert> : null}
        {!profileQuery.isLoading && !profileQuery.isError && !profile ? (
          <div className="rounded-lg border bg-card"><EmptyState title="Employee profile is not available." description="The employee may not exist or may be outside your allowed scope." icon={<ShieldAlert className="h-8 w-8" />} /></div>
        ) : null}
        {profile && employee ? (
          <>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-3">
                  <EmployeeAvatar name={employee.full_name} employeeCode={employee.employee_code} photoUrl={employee.profile_photo_url} size="lg" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">{employee.full_name}</h2>
                      <EmployeeStatusBadge status={employee.employment_status} />
                      <StatusBadge status={employee.employee_type} />
                    </div>
                    <p className="text-sm text-muted-foreground">{employee.employee_code} · {employee.primary_outlet_name ?? "No outlet"} · {employee.department_name ?? "No department"} · {employee.position_title ?? "No position"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Joined {cellValue(employee.joined_at)} · Nationality {cellValue(employee.nationality)}</p>
                  </div>
                </div>
                <div className="grid min-w-[280px] gap-2 sm:grid-cols-2">
                  <div className="rounded-md border p-2 text-sm"><span className="text-muted-foreground">Open alerts</span><p className="font-semibold">{cellValue(warnings.unresolved_expiry_alerts)}</p></div>
                  <div className="rounded-md border p-2 text-sm"><span className="text-muted-foreground">Missing punches</span><p className="font-semibold">{cellValue(warnings.missing_punches)}</p></div>
                  <div className="rounded-md border p-2 text-sm"><span className="text-muted-foreground">Pending approvals</span><p className="font-semibold">{cellValue(warnings.pending_approvals)}</p></div>
                  <div className="rounded-md border p-2 text-sm"><span className="text-muted-foreground">Payroll warnings</span><p className="font-semibold">{cellValue(warnings.payroll_warnings)}</p></div>
                  {canManageProfilePhoto ? (
                    <div className="sm:col-span-2">
                      <EmployeeProfilePhotoControls employeeId={employee.id} hasPhoto={Boolean(employee.profile_photo_url)} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {!employee.profile_photo_url ? (
              <InlineAlert title="Missing profile photo" variant="warning">
                This employee needs a profile photo. Employee creation is not blocked, but HR should upload a photo to complete the profile.
              </InlineAlert>
            ) : null}

            <Tabs defaultValue="overview">
              <TabsList className="flex h-auto flex-wrap justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                {canViewAttendanceCalendar ? <TabsTrigger value="attendance-calendar">Attendance Calendar</TabsTrigger> : null}
                <TabsTrigger value="leave">Leave</TabsTrigger>
                <TabsTrigger value="long-leave">Long Leave</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="contracts">Contracts</TabsTrigger>
                <TabsTrigger value="assets">Assets/Uniforms</TabsTrigger>
                <TabsTrigger value="payroll">Payroll Readiness</TabsTrigger>
                <TabsTrigger value="alerts">Alerts</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-3">
                <SimpleTable title="Overview" rows={metricRows({
                  "Employee code": employee.employee_code,
                  "Full name": employee.full_name,
                  "Employment status": employee.employment_status,
                  "Local/foreign": employee.employee_type,
                  Outlet: employee.primary_outlet_name,
                  Department: employee.department_name,
                  Position: employee.position_title,
                  "Join date": employee.joined_at,
                  Passport: employee.passport_number,
                  "Passport expiry": employee.passport_expiry_date,
                  "Work permit expiry": employee.work_permit_expiry_date,
                  "Current warnings": Object.values(warnings).reduce((sum, value) => sum + Number(value ?? 0), 0),
                })} columns={["metric", "value"]} />
                <SimpleTable title="Emergency Contact" rows={emergencyContactRows(employee)} columns={["metric", "value"]} empty="No emergency contact recorded." />
                <SimpleTable title="Login Access" rows={metricRows({
                  "Login status": employee.has_login ? "Login Assigned" : "No login assigned",
                  Username: employee.linked_username,
                  Email: employee.linked_user_email,
                  "Linked user": employee.linked_user_id,
                  Role: employee.linked_role_name,
                  "Store / outlet access": employee.linked_outlet_names || (employee.has_login ? `${employee.linked_outlet_count ?? 0} outlet(s)` : null),
                  "Account status": employee.linked_user_active ? "Active" : employee.has_login ? "Inactive / disabled" : null,
                  "Password reset required": employee.has_login ? (employee.linked_password_reset_required ? "Yes" : "No") : null,
                  "Two-factor": employee.has_login ? (employee.linked_two_factor_enabled ? "Enabled" : "Available after first sign-in") : null,
                  "Last login": employee.linked_last_login_at,
                })} columns={["metric", "value"]} />
              </TabsContent>

              <TabsContent value="attendance" className="space-y-3">
                {profile.attendance ? (
                  <>
                    <SimpleTable title="Current Month Attendance Summary" rows={metricRows(profile.attendance.current_month_summary)} columns={["metric", "value"]} />
                    <SimpleTable title="Recent Attendance Daily Rows" rows={recordRows(profile.attendance.recent_rows)} columns={["attendance_date", "status", "first_clock_in", "last_clock_out", "worked_minutes", "late_minutes", "overtime_minutes", "payroll_status"]} />
                    <SimpleTable title="Biometric / Attendance Source Summary" rows={recordRows(profile.attendance.source_summary)} columns={["event_time", "event_type", "attendance_method", "source", "sync_status", "approval_status"]} />
                  </>
                ) : <InlineAlert title="Attendance section is hidden for your role." />}
              </TabsContent>

              {canViewAttendanceCalendar ? (
                <TabsContent value="attendance-calendar" className="space-y-3">
                  <EmployeeAttendanceCalendarWidget source="employee" employeeId={employeeId ?? ""} />
                </TabsContent>
              ) : null}

              <TabsContent value="leave" className="space-y-3">
                {profile.leave ? (
                  <>
                    <SimpleTable title="Leave Balances" rows={recordRows(profile.leave.balances)} columns={["leave_name", "entitlement_days", "opening_balance", "accrued_days", "used_days", "pending_days", "carried_forward_days", "expired_days", "available_days", "status"]} />
                    <SimpleTable title="Recent Leave Requests" rows={recordRows(profile.leave.recent_requests)} columns={["leave_name", "start_date", "end_date", "total_days", "status", "approval_status", "reason"]} />
                    <SimpleTable title="Leave Transaction History" rows={recordRows(profile.leave.transactions)} columns={["effective_date", "transaction_type", "quantity_days", "balance_before", "balance_after", "source", "reason"]} />
                  </>
                ) : <InlineAlert title="Leave section is hidden for your role." />}
              </TabsContent>

              <TabsContent value="long-leave" className="space-y-3">
                {profile.long_leave ? (
                  <>
                    <SimpleTable title="Current Long Leave" rows={profile.long_leave.active ? [profile.long_leave.active] : []} columns={["start_date", "expected_return_date", "actual_return_date", "total_days", "status", "approval_status", "payroll_status"]} />
                    <SimpleTable title="Long Leave History" rows={recordRows(profile.long_leave.history)} columns={["start_date", "expected_return_date", "actual_return_date", "total_days", "status", "approval_status", "payroll_status"]} />
                    <SimpleTable title="Payroll Impact Summary" rows={recordRows(profile.long_leave.payroll_impacts)} columns={["payroll_month", "long_leave_days", "payable_days", "unpaid_days", "deduction_amount", "payable_salary", "status"]} />
                  </>
                ) : <InlineAlert title="Long leave section is hidden for your role." />}
              </TabsContent>

              <TabsContent value="documents">
                {profile.documents ? <SimpleTable title="Documents" rows={recordRows(profile.documents.documents)} columns={["document_type", "file_name", "expiry_date", "status", "is_sensitive", "created_at"]} /> : <InlineAlert title="Documents section is hidden for your role." />}
              </TabsContent>

              <TabsContent value="contracts">
                {profile.contracts ? <SimpleTable title="Contracts" rows={recordRows(profile.contracts.contracts)} columns={["contract_number", "contract_type", "contract_status", "start_date", "end_date", "probation_end_date", "salary_snapshot_amount"]} /> : <InlineAlert title="Contracts section is hidden for your role." />}
              </TabsContent>

              <TabsContent value="assets" className="space-y-3">
                {profile.assets ? (
                  <>
                    <SimpleTable title="Assigned Assets" rows={recordRows(profile.assets.assets)} columns={["asset_code", "asset_name", "asset_type", "issued_date", "returned_date", "status", "issue_condition", "return_condition"]} />
                    <SimpleTable title="Assigned Uniforms" rows={recordRows(profile.assets.uniforms)} columns={["uniform_type", "quantity", "issued_date", "returned_date", "status"]} />
                  </>
                ) : <InlineAlert title="Assets and uniforms are hidden for your role." />}
              </TabsContent>

              <TabsContent value="payroll" className="space-y-3">
                {profile.payroll_readiness ? (
                  <>
                    <SimpleTable title="Salary Record Summary" rows={profile.payroll_readiness.salary_summary ? [profile.payroll_readiness.salary_summary] : []} columns={["monthly_salary_amount", "currency", "effective_from", "effective_to", "reason"]} />
                    <SimpleTable title="Payroll Readiness Warnings" rows={metricRows({
                      "Attendance exceptions affecting payroll": profile.payroll_readiness.attendance_exceptions_affecting_payroll,
                      "Negative leave balances": profile.payroll_readiness.leave_balance_warnings.length,
                      "Long leave payroll impacts": profile.payroll_readiness.long_leave_payroll_impact.length,
                    })} columns={["metric", "value"]} />
                  </>
                ) : <InlineAlert title="Payroll readiness is hidden for your role." />}
              </TabsContent>

              <TabsContent value="alerts">
                {profile.alerts ? <SimpleTable title="Expiry Alerts" rows={recordRows(profile.alerts.alerts)} columns={["source_type", "source_label", "expiry_date", "days_until_expiry", "severity", "status", "title"]} /> : <InlineAlert title="Alerts are hidden for your role." />}
              </TabsContent>

              <TabsContent value="history">
                {profile.timeline ? <SimpleTable title="History / Timeline" rows={recordRows(profile.timeline.events)} columns={["date", "type", "label", "reason"]} /> : <InlineAlert title="History is hidden for your role." />}
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </div>
  );
};
