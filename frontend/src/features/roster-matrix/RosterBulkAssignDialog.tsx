import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RosterMatrixChange, RosterWeeklyMatrixResponse } from "./rosterWeeklyMatrix.types";

export const RosterBulkAssignDialog = ({
  open,
  data,
  onOpenChange,
  onStageChanges,
}: {
  open: boolean;
  data: RosterWeeklyMatrixResponse | undefined;
  onOpenChange: (open: boolean) => void;
  onStageChanges: (changes: RosterMatrixChange[]) => void;
}) => {
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [shiftId, setShiftId] = useState<string>("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmployeeIds([]);
    setDates([]);
    setShiftId("");
    setReason("");
  }, [open]);

  const toggle = (current: string[], value: string) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

  const stage = () => {
    if (!data || !shiftId || employeeIds.length === 0 || dates.length === 0) return;
    const changes = employeeIds.flatMap((employeeId) =>
      dates.map((date) => ({
        employee_id: employeeId,
        date,
        action: "ASSIGN_SHIFT" as const,
        shift_template_id: shiftId,
        reason: reason || "Bulk roster assignment staged from weekly matrix.",
        note: reason || null,
      })),
    );
    onStageChanges(changes);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk assign roster shifts</DialogTitle>
          <DialogDescription>
            Select employees, days, and a shift. The generated changes are staged locally and still require validation, draft save, or approval submission.
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <p className="text-sm text-muted-foreground">Load the weekly matrix before bulk assigning shifts.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Employees</Label>
              <div className="max-h-48 space-y-2 overflow-auto rounded-md border p-3">
                {data.employees.map((employee) => (
                  <Label key={employee.id} className="flex items-center gap-2 text-sm font-normal">
                    <Checkbox checked={employeeIds.includes(employee.id)} onCheckedChange={() => setEmployeeIds((current) => toggle(current, employee.id))} />
                    <span>{employee.name}</span>
                    <span className="text-xs text-muted-foreground">{employee.employee_no}</span>
                  </Label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Days</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                {data.week.days.map((day) => (
                  <Label key={day.date} className="flex items-center gap-2 text-sm font-normal">
                    <Checkbox checked={dates.includes(day.date)} onCheckedChange={() => setDates((current) => toggle(current, day.date))} />
                    <span>{day.label} {day.date.slice(5)}</span>
                  </Label>
                ))}
              </div>
            </div>
            <Label className="grid gap-2 md:col-span-2">
              <span>Shift</span>
              <Select value={shiftId} onValueChange={setShiftId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose shift" />
                </SelectTrigger>
                <SelectContent>
                  {data.shifts.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>{shift.name} / {shift.start_time} - {shift.end_time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <Label className="grid gap-2 md:col-span-2">
              <span>Reason / note</span>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for bulk roster assignment" />
            </Label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button disabled={!data || !shiftId || employeeIds.length === 0 || dates.length === 0} onClick={stage}>
            Stage {employeeIds.length * dates.length || ""} change{employeeIds.length * dates.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
