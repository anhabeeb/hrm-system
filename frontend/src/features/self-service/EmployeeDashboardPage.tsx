import { useQuery } from "@tanstack/react-query";

import { LinkedEmployeeOnlyGuard } from "@/components/access/LinkedEmployeeOnlyGuard";
import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { DashboardGrid } from "@/components/widgets";
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

  return (
    <LinkedEmployeeOnlyGuard>
      <div className="space-y-4 p-4 md:p-6">
        {query.isLoading ? <LoadingState rows={8} /> : null}
        {query.isError ? <InlineAlert title={friendlyOperationalError(query.error, "Employee dashboard could not be loaded.")} variant="error" /> : null}
        {dashboard && !dashboard.profile.linked_employee ? <NotLinkedEmployeeState /> : null}
        {dashboard ? (
          <>
            <SelfServiceCommandHeader dashboard={dashboard} />
            {modern ? (
              <DashboardGrid>
                <MyAttendanceTodayWidget widget={modern.attendance_today} />
                <MyAttendanceCalendarPreviewWidget widget={modern.attendance_calendar_preview} />
                <MyLeaveBalanceWidget widget={modern.leave_balance} />
                <MyUpcomingRosterWidget widget={modern.upcoming_roster} />
                <MyPendingRequestsWidget widget={modern.pending_requests} />
                <MyDocumentsKycWidget widget={modern.documents_kyc} />
                <MyPayslipsWidget widget={modern.payslips} />
                <MyApprovalsWidget widget={modern.my_approvals} />
                <MyOffboardingStatusWidget widget={modern.offboarding_status} />
                <MyAcknowledgementsWidget widget={modern.acknowledgements} />
                <MySelfServiceActivityWidget widget={modern.recent_activity} />
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
