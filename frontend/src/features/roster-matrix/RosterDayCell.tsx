import { AlertTriangle, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RosterMatrixCell } from "./rosterWeeklyMatrix.types";
import { rosterStatusClass } from "./rosterWeeklyMatrix.utils";

export const RosterDayCell = ({ cell, onOpen }: { cell: RosterMatrixCell; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className={cn(
      "min-h-20 w-full rounded-md border p-1.5 text-left transition hover:border-slate-300 hover:bg-white",
      ["DAY_OFF", "HOLIDAY", "EMPTY", "NOT_ACTIVE", "OUTSIDE_EMPLOYMENT"].includes(cell.status) ? "bg-slate-50" : "bg-white",
      cell.errors.length ? "border-red-200" : cell.warnings.length ? "border-amber-200" : "border-slate-200",
    )}
  >
    <div className="flex items-center justify-between gap-1">
      <Badge variant="outline" className={cn("max-w-full truncate px-1.5 py-0 text-[11px]", rosterStatusClass(cell.status))}>{cell.label}</Badge>
      <div className="flex items-center gap-1">
        {cell.is_locked ? <Lock className="h-3.5 w-3.5 text-slate-500" /> : null}
        {cell.errors.length || cell.warnings.length ? <AlertTriangle className={cn("h-3.5 w-3.5", cell.errors.length ? "text-red-600" : "text-amber-600")} /> : null}
      </div>
    </div>
    {cell.shift ? (
      <div className="mt-1 text-[11px] leading-4">
        <p className="truncate font-medium">{cell.shift.name ?? "Assigned shift"}</p>
        <p className="text-muted-foreground">{cell.shift.start_time ?? "--"} - {cell.shift.end_time ?? "--"}</p>
      </div>
    ) : null}
    {cell.pending_change ? <p className="mt-1 truncate text-[11px] text-sky-700">Pending {cell.pending_change.change_type}</p> : null}
    {cell.attendance_overlay ? (
      <p className={cn("mt-1 truncate text-[11px]", cell.attendance_overlay.review_required ? "text-amber-700" : "text-emerald-700")}>
        {cell.attendance_overlay.label}
      </p>
    ) : null}
  </button>
);
