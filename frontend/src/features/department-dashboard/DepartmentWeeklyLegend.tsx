import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DepartmentWeeklyStatus } from "./departmentWeeklyTeam.types";
import { statusBadgeClass } from "./departmentWeeklyTeam.utils";

const items: Array<{ status: DepartmentWeeklyStatus; label: string }> = [
  { status: "PRESENT", label: "Present" },
  { status: "LATE", label: "Late" },
  { status: "LEAVE", label: "Leave" },
  { status: "SICK", label: "Sick" },
  { status: "ABSENT", label: "Absent" },
  { status: "DAY_OFF", label: "Day Off" },
  { status: "HOLIDAY", label: "Holiday" },
  { status: "PENDING_CORRECTION", label: "Pending Correction" },
  { status: "MISSING_PUNCH", label: "Missing Punch" },
];

export const DepartmentWeeklyLegend = () => (
  <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3">
    {items.map((item) => <Badge key={item.status} variant="outline" className={cn("px-2 py-1", statusBadgeClass(item.status))}>{item.label}</Badge>)}
  </div>
);
