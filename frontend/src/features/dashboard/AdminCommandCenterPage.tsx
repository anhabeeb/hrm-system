import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { DashboardGrid, WidgetCard } from "@/components/widgets";
import { ApiError } from "@/lib/api-errors";

import { ApprovalCommandQueueWidget } from "./ApprovalCommandQueueWidget";
import { AttendancePulseWidget } from "./AttendancePulseWidget";
import { CommandCenterHeader } from "./CommandCenterHeader";
import { commandCenterApi } from "./commandCenter.api";
import { DepartmentHealthWidget } from "./DepartmentHealthWidget";
import { DisciplinaryFollowUpWidget } from "./DisciplinaryFollowUpWidget";
import { DocumentExpiryWidget } from "./DocumentExpiryWidget";
import { EmployeeAttentionWidget } from "./EmployeeAttentionWidget";
import { LifecycleWidget } from "./LifecycleWidget";
import { OperationOwnershipHealthWidget } from "./OperationOwnershipHealthWidget";
import { PayrollReadinessWidget } from "./PayrollReadinessWidget";
import { PeopleSnapshotWidget } from "./PeopleSnapshotWidget";
import { RecentActivityWidget } from "./RecentActivityWidget";
import { RosterCoverageWidget } from "./RosterCoverageWidget";

const isDashboardPermissionError = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 403 || error.code === "PERMISSION_DENIED" || error.code === "FEATURE_DISABLED");

export const AdminCommandCenterPage = () => {
  const query = useQuery({ queryKey: ["dashboard-command-center"], queryFn: () => commandCenterApi.get() });
  const commandCenter = query.data?.data.data;
  const permissionDenied = isDashboardPermissionError(query.error);

  if (query.isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <WidgetCard title="Loading command center" loading />
        <DashboardGrid>
          {Array.from({ length: 8 }).map((_, index) => (
            <WidgetCard key={index} title="Loading widget" loading />
          ))}
        </DashboardGrid>
      </div>
    );
  }

  if (permissionDenied) {
    return (
      <div className="p-4 md:p-6">
        <div className="overflow-hidden rounded-lg border bg-card">
          <EmptyState
            title="Admin dashboard is not available for your role."
            description="Use the modules available in the sidebar, or contact an administrator if you need dashboard access."
            icon={<ShieldAlert className="h-8 w-8" />}
          />
        </div>
      </div>
    );
  }

  if (query.isError || !commandCenter) {
    return (
      <div className="p-4 md:p-6">
        <InlineAlert title="Command center could not be loaded." variant="error">
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void query.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </InlineAlert>
      </div>
    );
  }

  const widgets = commandCenter.widgets;

  return (
    <div className="min-h-full bg-slate-50/60">
      <div className="space-y-4 p-4 md:p-6">
        <CommandCenterHeader header={commandCenter.header} />

        <DashboardGrid>
          <PeopleSnapshotWidget widget={widgets.people_snapshot} />
          <AttendancePulseWidget widget={widgets.attendance_pulse} />
          <PayrollReadinessWidget widget={widgets.payroll_readiness} />
          <DocumentExpiryWidget widget={widgets.document_expiry} />
          <RosterCoverageWidget widget={widgets.roster_coverage} />
          <LifecycleWidget widget={widgets.lifecycle} />
          <DisciplinaryFollowUpWidget widget={widgets.disciplinary_follow_up} />
          <OperationOwnershipHealthWidget widget={widgets.operation_ownership_health} />
        </DashboardGrid>

        <DashboardGrid className="xl:grid-cols-2 2xl:grid-cols-2">
          <ApprovalCommandQueueWidget widget={widgets.approval_queue} />
          <EmployeeAttentionWidget widget={widgets.employee_attention} />
        </DashboardGrid>

        <DashboardGrid className="xl:grid-cols-2 2xl:grid-cols-2">
          <DepartmentHealthWidget widget={widgets.department_health} />
          <RecentActivityWidget widget={widgets.recent_activity} />
        </DashboardGrid>
      </div>
    </div>
  );
};
