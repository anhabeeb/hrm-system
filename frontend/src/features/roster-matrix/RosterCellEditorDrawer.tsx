import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RosterMatrixCell, RosterMatrixChange, RosterMatrixEmployee, RosterMatrixShift, RosterWeeklyMatrixResponse } from "./rosterWeeklyMatrix.types";
import { RosterShiftSelect } from "./RosterShiftSelect";

export const RosterCellEditorDrawer = ({
  employee,
  cell,
  shifts,
  permissions,
  onClose,
  onSubmitChange,
}: {
  employee: RosterMatrixEmployee | null;
  cell: RosterMatrixCell | null;
  shifts: RosterMatrixShift[];
  permissions?: RosterWeeklyMatrixResponse["permissions"];
  onClose: () => void;
  onSubmitChange: (change: RosterMatrixChange) => void;
}) => {
  const [shiftId, setShiftId] = useState<string | null>(cell?.shift?.id ?? null);
  const [note, setNote] = useState("");
  useEffect(() => {
    setShiftId(cell?.shift?.id ?? null);
    setNote("");
  }, [cell?.assignment_id, cell?.date, cell?.shift?.id]);
  if (!employee || !cell) return null;
  const canEdit = Boolean(permissions?.can_edit || permissions?.can_submit);
  const base = {
    employee_id: employee.id,
    date: cell.date,
    assignment_id: cell.assignment_id,
    note,
    reason: note || "Roster weekly matrix update.",
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l bg-white p-4 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{employee.name}</h2>
          <p className="text-sm text-muted-foreground">{cell.date} / {employee.position_name ?? "Unassigned position"}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close roster cell editor"><X className="h-4 w-4" /></Button>
      </div>
      <div className="mt-4 space-y-4 text-sm">
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Current cell</p>
          <p className="mt-1 font-medium">{cell.label}</p>
          <p className="text-xs text-muted-foreground">{cell.shift ? `${cell.shift.name ?? "Shift"} ${cell.shift.start_time ?? ""} - ${cell.shift.end_time ?? ""}` : "No shift assigned"}</p>
        </div>
        {cell.warnings.concat(cell.errors).length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
            {cell.errors.concat(cell.warnings).map((message) => <p key={message}>{message}</p>)}
          </div>
        ) : null}
        {cell.attendance_overlay ? (
          <div className="rounded-md border bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Attendance overlay</p>
            <p className="mt-1 font-medium">{cell.attendance_overlay.label}</p>
            <p className="text-xs text-muted-foreground">
              In {cell.attendance_overlay.check_in ?? "--"} / Out {cell.attendance_overlay.check_out ?? "--"}
              {cell.attendance_overlay.late_minutes ? ` / Late ${cell.attendance_overlay.late_minutes}m` : ""}
            </p>
          </div>
        ) : null}
        <Label className="grid gap-1">
          <span>Shift</span>
          <RosterShiftSelect value={shiftId} shifts={shifts} onChange={setShiftId} />
        </Label>
        <Label className="grid gap-1">
          <span>Reason / note</span>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain the roster change for approval/audit" />
        </Label>
        <div className="grid gap-2">
          <Button disabled={!canEdit || !shiftId || cell.is_locked} onClick={() => onSubmitChange({ ...base, action: cell.assignment_id ? "CHANGE_SHIFT" : "ASSIGN_SHIFT", shift_template_id: shiftId })}>
            {cell.assignment_id ? "Change shift" : "Assign shift"}
          </Button>
          <Button variant="outline" disabled={!canEdit || cell.is_locked} onClick={() => onSubmitChange({ ...base, action: "MARK_DAY_OFF" })}>Mark day off</Button>
          <Button variant="outline" disabled={!canEdit || !cell.assignment_id || cell.is_locked} onClick={() => onSubmitChange({ ...base, action: "CLEAR_SHIFT" })}>Clear shift</Button>
          {!canEdit ? <p className="text-xs text-muted-foreground">You can review this cell, but you do not have permission to edit roster assignments.</p> : null}
        </div>
      </div>
    </aside>
  );
};
