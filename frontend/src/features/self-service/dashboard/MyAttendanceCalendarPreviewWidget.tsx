import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";

import { MiniCalendarWidget, StatusStrip } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asNumber, asRecord, statusTone, visible } from "./selfServiceDashboard.utils";

export const MyAttendanceCalendarPreviewWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["attendance_calendar_preview"] }) => {
  if (!visible(widget)) return null;
  const summary = asRecord(widget?.summary);
  const period = asRecord(widget?.payroll_period);
  const days = Array.isArray(widget?.days) ? widget.days as Array<Record<string, unknown>> : [];

  return (
    <MiniCalendarWidget
      title="My Attendance Calendar"
      description={period.start_date ? `Payroll period: ${period.start_date} - ${period.end_date}` : "Current month preview"}
      icon={<CalendarDays className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/attendance-calendar">Open</Link></Button>}
      days={days.slice(0, 14).map((day) => ({
        date: String(day.label ?? day.status ?? ""),
        label: String(day.date ?? "").slice(8, 10) || "-",
        status: statusTone(day.status),
      }))}
      footer={
        <StatusStrip
          compact
          items={[
            { label: "Present", value: asNumber(summary.present_days), status: "success" },
            { label: "Late", value: asNumber(summary.late_days), status: "warning" },
            { label: "Leave", value: asNumber(summary.leave_days), status: "info" },
            { label: "Absent", value: asNumber(summary.absent_days), status: "danger" },
            { label: "Review", value: asNumber(summary.review_required_days), status: "warning" },
          ]}
        />
      }
    />
  );
};
