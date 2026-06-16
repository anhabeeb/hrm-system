import { useQuery } from "@tanstack/react-query";

import { LinkedEmployeeOnlyGuard } from "@/components/access/LinkedEmployeeOnlyGuard";
import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { DashboardGrid } from "@/components/widgets";
import { selfServiceWidgetDefinitions } from "@/config/dashboardWidgets";
import { DashboardCustomizeButton } from "@/features/dashboard-personalization/DashboardCustomizeButton";
import { usePersonalizedWidgets } from "@/features/dashboard-personalization/dashboardPreferences.utils";
import { friendlyOperationalError } from "@/lib/safe-display";
import { SelfServiceCommandHeader } from "./dashboard/SelfServiceCommandHeader";
import { MyAcknowledgementsWidget } from "./dashboard/MyAcknowledgementsWidget";
import { MyApprovalsWidget } from "./dashboard/MyApprovalsWidget";
import { MyAttendanceCalendarPreviewWidget } from "./dashboard/MyAttendanceCalendarPreviewWidget";
import { MyAttendanceTodayWidget } from "./dashboard/MyAttendanceTodayWidget";
import { MyDocumentsKycWidget } from "./dashboard/MyDocumentsKycWidget";
import { MyLeaveBalanceWidget } from "./dashboard/MyLeaveBalanceWidget";
import { MyOffboardingStatusWidget } from "./dashboard/MyOffboardingStatusWidget";
import { MyPayslipsWidget } from "./dashboard/MyPayslipsWidget";
import { MyPendingRequestsWidget } from "./dashboard/MyPendingRequestsWidget";
import { MySelfServiceActivityWidget } from "./dashboard/MySelfServiceActivityWidget";
import { MyUpcomingRosterWidget } from "./dashboard/MyUpcomingRosterWidget";
import { selfServiceApi } from "./self-service.api";
import { NotLinkedEmployeeState, RequestsTable, WidgetCard } from "./SelfServiceShared";

export const EmployeeDashboardPage = () => {
  const query = useQuery({ queryKey: ["self-service", "dashboard"], queryFn: selfServiceApi.dashboard });
  const dashboard = query.data?.data;
  const modern = dashboard?.modern_widgets;
  const personalization = usePersonalizedWidgets("SELF_SERVICE_DASHBOARD", selfServiceWidgetDefinitions, {
    enabled: Boolean(dashboard?.profile.linked_employee),
  });
  const modernRenderers = modern ? {
    "my-attendance-today": <MyAttendanceTodayWidget widget={modern.attendance_today} />,
    "my-attendance-calendar-preview": <MyAttendanceCalendarPreviewWidget widget={modern.attendance_calendar_preview} />,
    "my-leave-balance": <MyLeaveBalanceWidget widget={modern.leave_balance} />,
    "my-upcoming-roster": <MyUpcomingRosterWidget widget={modern.upcoming_roster} />,
    "my-pending-requests": <MyPendingRequestsWidget widget={modern.pending_requests} />,
    "my-documents-kyc": <MyDocumentsKycWidget widget={modern.documents_kyc} />,
    "my-payslips": <MyPayslipsWidget widget={modern.payslips} />,
    "my-approvals": <MyApprovalsWidget widget={modern.my_approvals} />,
    "my-offboarding-status": <MyOffboardingStatusWidget widget={modern.offboarding_status} />,
    "my-acknowledgements": <MyAcknowledgementsWidget widget={modern.acknowledgements} />,
    "my-recent-activity": <MySelfServiceActivityWidget widget={modern.recent_activity} />,
  } as const : null;

  return (
    <LinkedEmployeeOnlyGuard>
      <div className="space-y-4 p-4 md:p-6">
        {query.isLoading ? <LoadingState rows={8} /> : null}
        {query.isError ? <InlineAlert title={friendlyOperationalError(query.error, "Employee dashboard could not be loaded.")} variant="error" /> : null}
        {dashboard && !dashboard.profile.linked_employee ? <NotLinkedEmployeeState /> : null}
        {dashboard ? (
          <>
            <div className="flex justify-end">
              <DashboardCustomizeButton
                dashboardType="SELF_SERVICE_DASHBOARD"
                widgets={personalization.allWidgets}
                isSaving={personalization.isSaving}
                isResetting={personalization.isResetting}
                onSaveLayout={personalization.saveLayout}
                onResetLayout={() => personalization.resetLayout()}
              />
            </div>
            <SelfServiceCommandHeader dashboard={dashboard} />
            {modern ? (
              <DashboardGrid>
                {personalization.visibleWidgets.map((widget) => (
                  <div key={widget.id} className={widget.size === "wide" ? "xl:col-span-2" : undefined}>
                    {modernRenderers?.[widget.id as keyof typeof modernRenderers] ?? null}
                  </div>
                ))}
              </DashboardGrid>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {dashboard.widgets.map((widget) => <WidgetCard key={widget.key} widget={widget} />)}
              </div>
            )}
            <div className="grid gap-4 xl:grid-cols-2">
              <RequestsTable rows={dashboard.requests} emptyTitle="No recent requests." />
              <RequestsTable rows={dashboard.pending_approvals} emptyTitle="No pending approvals assigned to you." />
            </div>
          </>
        ) : null}
      </div>
    </LinkedEmployeeOnlyGuard>
  );
};
