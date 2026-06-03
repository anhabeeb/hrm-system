import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Clock3, FileWarning, Landmark, RefreshCw, ShieldAlert, Users } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { LoadingState } from "@/components/data/LoadingState";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-errors";

import { dashboardApi } from "./dashboard.api";
import { SummaryPanel } from "./dashboard.components";

const numberValue = (value: number | undefined) => value ?? "Not available";

const isDashboardPermissionError = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 403 || error.code === "PERMISSION_DENIED" || error.code === "FEATURE_DISABLED");

export const DashboardPage = () => {
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardApi.summary(),
  });
  const summary = summaryQuery.data?.data;
  const dashboardPermissionDenied = isDashboardPermissionError(summaryQuery.error);
  const attentionRows = [
    { id: "leave", item: "Pending leave requests", area: "Leave", count: summary?.pending_leave_requests ?? 0, status: (summary?.pending_leave_requests ?? 0) > 0 ? "pending" : "completed" },
    { id: "clock", item: "Missing clock-outs today", area: "Attendance", count: summary?.missing_clock_out_today ?? 0, status: (summary?.missing_clock_out_today ?? 0) > 0 ? "warning" : "completed" },
    { id: "documents", item: "Documents expiring soon", area: "Documents", count: summary?.documents_expiring_soon ?? 0, status: (summary?.documents_expiring_soon ?? 0) > 0 ? "warning" : "completed" },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of today's HR operations" />
      <div className="space-y-4 p-4 md:p-6">
        {summaryQuery.isLoading ? (
          <LoadingState rows={8} />
        ) : dashboardPermissionDenied ? (
          <div className="overflow-hidden rounded-lg border bg-card">
            <EmptyState
              title="Dashboard summary is not available for your role."
              description="You can still use the modules available in the sidebar. Contact your administrator if you need dashboard reporting access."
              icon={<ShieldAlert className="h-8 w-8" />}
            />
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
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <SummaryPanel label="Active employees" value={numberValue(summary?.total_active_employees)} icon={<Users className="h-4 w-4" />} helper="Scoped by your access" />
              <SummaryPanel label="Checked in today" value={numberValue(summary?.checked_in_today)} icon={<Clock3 className="h-4 w-4" />} helper={`${summary?.employees_on_leave_today ?? 0} on leave`} />
              <SummaryPanel label="Pending approvals" value={numberValue(summary?.pending_approval_requests ?? summary?.pending_leave_requests)} icon={<ClipboardCheck className="h-4 w-4" />} helper="Includes available approval queues" />
              {summary?.documents_expiring_soon !== undefined ? (
                <SummaryPanel label="Documents expiring" value={summary.documents_expiring_soon} icon={<FileWarning className="h-4 w-4" />} helper={`${summary.missing_required_documents ?? 0} missing required`} />
              ) : null}
              {summary?.latest_payroll_status !== undefined ? (
                <SummaryPanel label="Payroll status" value={summary.latest_payroll_status?.status ?? "Not available"} icon={<Landmark className="h-4 w-4" />} helper={summary.latest_payroll_status?.payroll_month} />
              ) : null}
            </div>

            <DataTable
              columns={[
                { key: "item", header: "Attention Required" },
                { key: "area", header: "Area" },
                { key: "count", header: "Count" },
                { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
              ]}
              rows={attentionRows}
              getRowId={(row) => row.id}
              emptyTitle="No urgent items right now."
              rowActions={() => <RowActions actions={[{ key: "view" }, { key: "more" }]} />}
            />

            <div className="grid gap-4 xl:grid-cols-3">
              <DataTable
                columns={[
                  { key: "metric", header: "Today's Attendance" },
                  { key: "value", header: "Value" },
                ]}
                rows={[
                  { id: "checked", metric: "Checked in", value: summary?.checked_in_today ?? 0 },
                  { id: "missing", metric: "Missing clock-out", value: summary?.missing_clock_out_today ?? 0 },
                ]}
                getRowId={(row) => row.id}
              />
              <DataTable
                columns={[
                  { key: "metric", header: "Compliance" },
                  { key: "value", header: "Value" },
                ]}
                rows={[
                  { id: "expiring", metric: "Expiring documents", value: summary?.documents_expiring_soon ?? "Not available" },
                  { id: "missing-docs", metric: "Missing required documents", value: summary?.missing_required_documents ?? "Not available" },
                ]}
                getRowId={(row) => row.id}
              />
              <DataTable
                columns={[
                  { key: "metric", header: "Device & Sync Health" },
                  { key: "value", header: "Value" },
                ]}
                rows={[
                  { id: "active-devices", metric: "Active devices", value: summary?.active_devices ?? "Not available" },
                  { id: "warnings", metric: "Devices with warnings", value: summary?.devices_with_warnings ?? "Not available" },
                ]}
                getRowId={(row) => row.id}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
