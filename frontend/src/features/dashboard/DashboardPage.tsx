import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, Bell, Clock3, FileWarning, HeartPulse, RefreshCw, ShieldAlert, UserRoundSearch, Users } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { LoadingState } from "@/components/data/LoadingState";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";
import { dashboardApi } from "./dashboard.api";
import { SummaryPanel } from "./dashboard.components";

const num = (value?: number | null) => value ?? 0;
const metricRows = (values: Record<string, number | string | boolean | null | undefined>) =>
  Object.entries(values).map(([metric, value]) => ({ id: metric, metric, value: typeof value === "boolean" ? (value ? "Yes" : "No") : value ?? "Not available" }));

const isDashboardPermissionError = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 403 || error.code === "PERMISSION_DENIED" || error.code === "FEATURE_DISABLED");

export const DashboardPage = () => {
  const auth = useAuth();
  const summaryQuery = useQuery({ queryKey: ["dashboard-summary"], queryFn: () => dashboardApi.summary() });
  const attentionQuery = useQuery({ queryKey: ["dashboard-attention"], queryFn: () => dashboardApi.attention() });
  const actionsQuery = useQuery({ queryKey: ["dashboard-quick-actions"], queryFn: () => dashboardApi.quickActions() });
  const summary = summaryQuery.data?.data.data;
  const permissionDenied = isDashboardPermissionError(summaryQuery.error);

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {summaryQuery.isLoading ? (
          <LoadingState rows={8} />
        ) : permissionDenied ? (
          <div className="overflow-hidden rounded-lg border bg-card">
            <EmptyState title="Dashboard is not available for your role." description="You can still use the modules available in the sidebar. Contact an administrator if you need dashboard access." icon={<ShieldAlert className="h-8 w-8" />} />
          </div>
        ) : summaryQuery.isError ? (
          <InlineAlert title="Dashboard data could not be loaded." variant="error">
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void summaryQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </InlineAlert>
        ) : (
          <>
            <h2 className="sr-only">Employee Summary</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <SummaryPanel label="Active employees" value={num(summary?.employee_summary?.total_active_employees)} icon={<Users className="h-4 w-4" />} helper={`${num(summary?.employee_summary?.foreign_employees)} foreign · ${num(summary?.employee_summary?.local_employees)} local`} />
              <SummaryPanel label="Present today" value={num(summary?.attendance_today?.present_today)} icon={<Clock3 className="h-4 w-4" />} helper={`${num(summary?.attendance_today?.late_checkins_today)} late`} />
              <SummaryPanel label="Pending approvals" value={num(summary?.leave_approvals?.pending_leave_approvals)} icon={<Activity className="h-4 w-4" />} helper={`${num(summary?.leave_approvals?.approval_inbox_count)} in your inbox`} />
              <SummaryPanel label="Long leave" value={num(summary?.long_leave?.employees_currently_on_long_leave)} icon={<HeartPulse className="h-4 w-4" />} helper={`${num(summary?.long_leave?.payroll_review_required)} payroll reviews`} />
              <SummaryPanel label="Critical alerts" value={num(summary?.expiry_alerts?.critical_alerts)} icon={<FileWarning className="h-4 w-4" />} helper={`${num(summary?.expiry_alerts?.due_within_7_days)} due in 7 days`} />
              <SummaryPanel label="Unread notifications" value={num(summary?.notifications_email_health?.unread_in_app_notifications)} icon={<Bell className="h-4 w-4" />} helper={`${num(summary?.notifications_email_health?.urgent_notifications)} urgent`} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <DataTable
                compact
                columns={[
                  { key: "title", header: "Needs Attention" },
                  { key: "area", header: "Area" },
                  { key: "count", header: "Count" },
                  { key: "priority", header: "Priority", cell: (row) => <StatusBadge status={row.priority} /> },
                  { key: "href", header: "Open", cell: (row) => <Link className="text-sm font-medium text-primary hover:underline" to={row.href}>View all</Link> },
                ]}
                rows={attentionQuery.data?.data.data ?? []}
                loading={attentionQuery.isLoading}
                getRowId={(row) => row.id}
                emptyTitle="Nothing urgent right now."
                emptyDescription="That is the rare HR dashboard equivalent of a quiet cup of tea."
              />
              <DataTable
                compact
                columns={[
                  { key: "label", header: "Quick Action" },
                  { key: "category", header: "Area" },
                  { key: "href", header: "Open", cell: (row) => <Link className="text-sm font-medium text-primary hover:underline" to={row.href}>Open</Link> },
                ]}
                rows={actionsQuery.data?.data.data ?? []}
                loading={actionsQuery.isLoading}
                getRowId={(row) => row.key}
                emptyTitle="No quick actions available."
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {summary?.attendance_today ? (
                <DataTable compact columns={[{ key: "metric", header: "Attendance Today" }, { key: "value", header: "Value" }]} rows={metricRows({
                  Present: summary.attendance_today.present_today,
                  Absent: summary.attendance_today.absent_today,
                  "Missing check-in": summary.attendance_today.missing_checkin_count,
                  "Missing checkout": summary.attendance_today.missing_checkout_count,
                  Overtime: summary.attendance_today.overtime_today,
                  "Holiday work": summary.attendance_today.holiday_work_today,
                  Exceptions: summary.attendance_today.attendance_exceptions_open,
                })} getRowId={(row) => row.id} />
              ) : null}
              {summary?.device_health ? (
                <DataTable compact columns={[{ key: "metric", header: "Biometric / Device Health" }, { key: "value", header: "Value" }]} rows={metricRows({
                  "Active devices": summary.device_health.active_devices,
                  "Offline devices": summary.device_health.offline_devices,
                  "Suspended/revoked": summary.device_health.suspended_revoked_devices,
                  "Unmatched punches": summary.device_health.unmatched_biometric_punches,
                  "Ambiguous punches": summary.device_health.ambiguous_biometric_punches,
                  "Invalid timestamp": summary.device_health.invalid_timestamp_punches,
                })} getRowId={(row) => row.id} />
              ) : null}
              {summary?.payroll_readiness ? (
                <DataTable compact columns={[{ key: "metric", header: "Payroll Readiness" }, { key: "value", header: "Value" }]} rows={metricRows({
                  "Attendance exceptions": summary.payroll_readiness.attendance_exceptions,
                  "Missing punches": summary.payroll_readiness.missing_punches,
                  "Long leave review": summary.payroll_readiness.long_leave_payroll_review,
                  "Leave adjustments": summary.payroll_readiness.pending_leave_adjustments,
                  "Approved leave not finalized": summary.payroll_readiness.approved_leave_not_finalized,
                  "Unfinalized payroll": summary.payroll_readiness.unfinalized_payroll_warning,
                })} getRowId={(row) => row.id} />
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {summary?.long_leave ? (
                <DataTable compact columns={[{ key: "metric", header: "Long Leave" }, { key: "value", header: "Value" }]} rows={metricRows({
                  Active: summary.long_leave.employees_currently_on_long_leave,
                  "Pending approval": summary.long_leave.long_leave_pending_approval,
                  "Returns this week": summary.long_leave.expected_returns_this_week,
                  "Returns this month": summary.long_leave.expected_returns_this_month,
                  "Overdue returns": summary.long_leave.overdue_returns,
                  "Payroll impact review": summary.long_leave.long_leave_payroll_impacts_pending_review,
                })} getRowId={(row) => row.id} />
              ) : null}
              {summary?.expiry_alerts ? (
                <DataTable compact columns={[{ key: "metric", header: "Expiry Alerts" }, { key: "value", header: "Value" }]} rows={metricRows({
                  Critical: summary.expiry_alerts.critical_alerts,
                  "Due today": summary.expiry_alerts.due_today,
                  "Due in 30 days": summary.expiry_alerts.due_within_30_days,
                  Overdue: summary.expiry_alerts.overdue_expired,
                  Passport: summary.expiry_alerts.passport_alerts,
                  "Visa / work permit": summary.expiry_alerts.visa_work_permit_alerts,
                })} getRowId={(row) => row.id} />
              ) : null}
              {summary?.holiday_roster_context ? (
                <DataTable compact columns={[{ key: "metric", header: "Holiday / Roster Context" }, { key: "value", header: "Value" }]} rows={metricRows({
                  "Today's holidays": summary.holiday_roster_context.todays_holidays.length,
                  "Upcoming holidays": summary.holiday_roster_context.upcoming_holidays.length,
                  "Holiday roster warnings": summary.holiday_roster_context.holiday_roster_warnings,
                  "Open roster conflicts": summary.holiday_roster_context.open_roster_conflicts,
                  "Unpublished roster warnings": summary.holiday_roster_context.unpublished_roster_warnings,
                })} getRowId={(row) => row.id} />
              ) : null}
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Employee 360</h2>
                  <p className="text-sm text-muted-foreground">Open a complete employee-wise profile from the employee directory.</p>
                </div>
                {auth.hasPermission("employees.view") ? (
                  <Button asChild variant="outline">
                    <Link to="/employees"><UserRoundSearch className="h-4 w-4" /> Find employee</Link>
                  </Button>
                ) : null}
              </div>
              <DataTable compact columns={[{ key: "metric", header: "Profile sections" }, { key: "value", header: "Included" }]} rows={metricRows({
                Overview: "Employee status, outlet, department, current warnings",
                Attendance: "Today, current month summary, recent rows",
                Leave: "Balances, requests, transactions",
                "Long Leave": "Current leave, history, payroll impact",
                Documents: "Expiry and missing-document context",
                "Contracts / Assets / Payroll / Alerts / History": "Permission-aware tabs",
              })} getRowId={(row) => row.id} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
