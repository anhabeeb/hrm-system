import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DepartmentWeeklyCell } from "./departmentWeeklyTeam.types";
import { statusBadgeClass } from "./departmentWeeklyTeam.utils";

export const DepartmentWeeklyDayCell = ({ cell, onOpen }: { cell: DepartmentWeeklyCell; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className={cn(
      "min-h-16 w-full rounded-md border p-1.5 text-left transition hover:border-slate-300 hover:bg-white",
      ["DAY_OFF", "HOLIDAY", "NOT_ACTIVE", "NO_RECORD"].includes(cell.status) ? "bg-slate-50 text-muted-foreground" : "bg-white",
    )}
  >
    <div className="flex items-center justify-between gap-1">
      <Badge variant="outline" className={cn("max-w-full truncate px-1.5 py-0 text-[11px]", statusBadgeClass(cell.status))}>{cell.label}</Badge>
      {cell.warnings.length ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" /> : null}
    </div>
    {cell.shift?.name || cell.shift?.start_time ? (
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{cell.shift.name ?? "Shift"} {cell.shift.start_time ?? ""}</p>
    ) : null}
  </button>
);
