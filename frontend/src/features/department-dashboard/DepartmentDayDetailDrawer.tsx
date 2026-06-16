import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DepartmentWeeklyCell, DepartmentWeeklyEmployee } from "./departmentWeeklyTeam.types";

export const DepartmentDayDetailDrawer = ({
  employee,
  cell,
  onClose,
}: {
  employee: DepartmentWeeklyEmployee | null;
  cell: DepartmentWeeklyCell | null;
  onClose: () => void;
}) => {
  if (!employee || !cell) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l bg-white p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{employee.name}</h2>
          <p className="text-sm text-muted-foreground">{cell.date} · {employee.position_name ?? "Unassigned position"}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close detail drawer"><X className="h-4 w-4" /></Button>
      </div>
      <div className="mt-4 space-y-4 text-sm">
        <div className="rounded-md border p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Status</p>
          <Badge className="mt-2" variant="outline">{cell.label}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Check-in" value={cell.attendance?.check_in} />
          <Info label="Check-out" value={cell.attendance?.check_out} />
          <Info label="Late minutes" value={cell.attendance?.late_minutes} />
          <Info label="Worked minutes" value={cell.attendance?.worked_minutes} />
          <Info label="Shift" value={cell.shift ? `${cell.shift.name ?? "Shift"} ${cell.shift.start_time ?? ""} - ${cell.shift.end_time ?? ""}` : null} />
          <Info label="Leave" value={cell.leave?.leave_type} />
          <Info label="Correction" value={cell.correction?.status} />
          <Info label="Holiday" value={cell.holiday?.name} />
        </div>
        {cell.warnings.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
            {cell.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        ) : null}
      </div>
    </aside>
  );
};

const Info = ({ label, value }: { label: string; value: unknown }) => (
  <div className="rounded-md border bg-slate-50 p-2">
    <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium">{value == null || value === "" ? "-" : String(value)}</p>
  </div>
);
