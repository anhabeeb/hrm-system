import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { DashboardGrid, WidgetCard } from "@/components/widgets";
import { adminCommandCenterWidgetDefinitions } from "@/config/dashboardWidgets";
import { useAuth } from "@/features/auth/auth.store";
import { DashboardCustomizeButton } from "@/features/dashboard-personalization/DashboardCustomizeButton";
import { usePersonalizedWidgets } from "@/features/dashboard-personalization/dashboardPreferences.utils";
import { SetupIncompleteDashboardBanner } from "@/features/setup-guide/SetupIncompleteDashboardBanner";
import { useSetupGuideStatus } from "@/features/setup-guide/useSetupGuide";
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
  const personalization = usePersonalizedWidgets("ADMIN_COMMAND_CENTER", adminCommandCenterWidgetDefinitions);
  const auth = useAuth();
  const setupStatus = useSetupGuideStatus(auth.isSuperAdmin || auth.hasAnyPermission(["setup_guide.manage", "settings.manage"]));

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
  const renderers = {
    "people-snapshot": <PeopleSnapshotWidget widget={widgets.people_snapshot} />,
    "attendance-pulse": <AttendancePulseWidget widget={widgets.attendance_pulse} />,
    "approval-queue": <ApprovalCommandQueueWidget widget={widgets.approval_queue} />,
    "payroll-readiness": <PayrollReadinessWidget widget={widgets.payroll_readiness} />,
    "department-health": <DepartmentHealthWidget widget={widgets.department_health} />,
    "document-expiry": <DocumentExpiryWidget widget={widgets.document_expiry} />,
    "roster-coverage": <RosterCoverageWidget widget={widgets.roster_coverage} />,
    "employee-attention": <EmployeeAttentionWidget widget={widgets.employee_attention} />,
    lifecycle: <LifecycleWidget widget={widgets.lifecycle} />,
    "disciplinary-follow-up": <DisciplinaryFollowUpWidget widget={widgets.disciplinary_follow_up} />,
    "operation-ownership-health": <OperationOwnershipHealthWidget widget={widgets.operation_ownership_health} />,
    "recent-activity": <RecentActivityWidget widget={widgets.recent_activity} />,
  } as const;

  return (
    <div className="min-h-full bg-slate-50/60">
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex justify-end">
          <DashboardCustomizeButton
            dashboardType="ADMIN_COMMAND_CENTER"
            widgets={personalization.allWidgets}
            isSaving={personalization.isSaving}
            isResetting={personalization.isResetting}
            onSaveLayout={personalization.saveLayout}
            onResetLayout={() => personalization.resetLayout()}
          />
        </div>
        <CommandCenterHeader header={commandCenter.header} />
        {setupStatus.data?.data ? <SetupIncompleteDashboardBanner progress={setupStatus.data.data} /> : null}

        <DashboardGrid>
          {personalization.visibleWidgets.map((widget) => (
            <div key={widget.id} className={widget.size === "wide" ? "xl:col-span-2" : undefined}>
              {renderers[widget.id as keyof typeof renderers] ?? null}
            </div>
          ))}
        </DashboardGrid>
      </div>
    </div>
  );
};
