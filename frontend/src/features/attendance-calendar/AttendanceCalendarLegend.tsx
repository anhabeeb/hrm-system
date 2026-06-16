import { Badge } from "@/components/ui/badge";

import { statusTone } from "./attendanceCalendar.utils";
import type { AttendanceCalendarStatus } from "./attendanceCalendar.types";

const legendItems: Array<{ status: AttendanceCalendarStatus; label: string }> = [
  { status: "PRESENT", label: "Present" },
  { status: "LATE", label: "Late" },
  { status: "LEAVE", label: "Leave" },
  { status: "SICK", label: "Sick Leave" },
  { status: "ABSENT", label: "Absent" },
  { status: "DAY_OFF", label: "Day Off" },
  { status: "HOLIDAY", label: "Holiday" },
  { status: "PENDING_CORRECTION", label: "Pending Correction" },
  { status: "MISSING_PUNCH", label: "Missing Punch" },
  { status: "REVIEW_REQUIRED", label: "Review Required" },
];

export const AttendanceCalendarLegend = () => (
  <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3 text-xs">
    {legendItems.map((item) => (
      <Badge key={item.status} variant="outline" className={statusTone(item.status)}>
        {item.label}
      </Badge>
    ))}
  </div>
);
