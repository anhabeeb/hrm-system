import { Badge } from "@/components/ui/badge";
import { rosterStatusClass } from "./rosterWeeklyMatrix.utils";
import type { RosterMatrixStatus } from "./rosterWeeklyMatrix.types";

const items: Array<{ status: RosterMatrixStatus; label: string }> = [
  { status: "SHIFT_ASSIGNED", label: "Shift" },
  { status: "DAY_OFF", label: "Day off" },
  { status: "LEAVE", label: "Leave" },
  { status: "SICK", label: "Sick" },
  { status: "HOLIDAY", label: "Holiday" },
  { status: "PENDING_CHANGE", label: "Pending change" },
  { status: "CONFLICT", label: "Conflict" },
  { status: "EMPTY", label: "Empty" },
];

export const RosterMatrixLegend = () => (
  <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3">
    {items.map((item) => <Badge key={item.status} variant="outline" className={rosterStatusClass(item.status)}>{item.label}</Badge>)}
  </div>
);
