import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useToast } from "@/components/feedback/useToast";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { formatTimeRange, label } from "./roster-format";
import { rostersApi } from "./rosters.api";
import type { RosterChangePayload, RosterShift } from "./rosters.types";

const today = new Date();
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const rangeStart = new Date(today);
rangeStart.setDate(today.getDate() - 14);
const rangeEnd = new Date(today);
rangeEnd.setDate(today.getDate() + 45);

const changeTypes = [
  { value: "SHIFT_TIME_CHANGE", label: "Shift time change" },
  { value: "SHIFT_SWAP", label: "Shift swap placeholder" },
  { value: "DAY_OFF_REQUEST", label: "Day off request placeholder" },
  { value: "GENERAL_ROSTER_CHANGE", label: "General roster change" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmployeeId?: string | null;
  canSelectEmployee?: boolean;
  onSubmitted?: () => Promise<void> | void;
}

export const RosterChangeRequestDialog = ({
  open,
  onOpenChange,
  currentEmployeeId,
  canSelectEmployee = false,
  onSubmitted,
}: Props) => {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState(currentEmployeeId ?? "");
  const [shiftId, setShiftId] = useState("");
  const [changeType, setChangeType] = useState("SHIFT_TIME_CHANGE");
  const [requestedDate, setRequestedDate] = useState(isoDate(today));
  const [requestedStart, setRequestedStart] = useState("");
  const [requestedEnd, setRequestedEnd] = useState("");
  const [reason, setReason] = useState("");

  const effectiveEmployeeId = canSelectEmployee ? employeeId : currentEmployeeId ?? "";
  const shiftsQuery = useQuery({
    queryKey: ["rosters", "change-request-shifts", effectiveEmployeeId],
    queryFn: () => rostersApi.list({
      employee_id: effectiveEmployeeId,
      date_from: isoDate(rangeStart),
      date_to: isoDate(rangeEnd),
      page_size: 100,
    }),
    enabled: open && Boolean(effectiveEmployeeId),
  });
  const selectedShift = useMemo(
    () => (shiftsQuery.data?.data ?? []).find((shift) => shift.id === shiftId) ?? null,
    [shiftId, shiftsQuery.data?.data],
  );

  const reset = () => {
    setEmployeeId(currentEmployeeId ?? "");
    setShiftId("");
    setChangeType("SHIFT_TIME_CHANGE");
    setRequestedDate(isoDate(today));
    setRequestedStart("");
    setRequestedEnd("");
    setReason("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!effectiveEmployeeId) throw new Error("Your employee profile is not linked to this login. Please contact HR.");
      const payload: RosterChangePayload = {
        employee_id: canSelectEmployee ? effectiveEmployeeId : undefined,
        shift_id: shiftId || undefined,
        change_type: changeType,
        requested_date: requestedDate || selectedShift?.roster_date || undefined,
        reason,
        requested_value_json: {
          placeholder: changeType === "SHIFT_SWAP" || changeType === "DAY_OFF_REQUEST",
          current_shift_id: selectedShift?.id ?? null,
        },
      };
      if (changeType === "SHIFT_TIME_CHANGE") {
        payload.requested_start_at = requestedStart;
        payload.requested_end_at = requestedEnd;
        payload.requested_value_json = {
          ...payload.requested_value_json,
          start_time: requestedStart,
          end_time: requestedEnd,
          roster_date: requestedDate || selectedShift?.roster_date,
        };
      }
      const created = await rostersApi.createChange(payload);
      return rostersApi.submitChange(created.data.roster_change.id);
    },
    onSuccess: async () => {
      toast.success("Your roster change request has been submitted for approval.");
      reset();
      onOpenChange(false);
      await onSubmitted?.();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Roster change request could not be submitted.")),
  });

  const timeChange = changeType === "SHIFT_TIME_CHANGE";
  const canSubmit = Boolean(effectiveEmployeeId && reason.trim() && (!timeChange || (requestedStart && requestedEnd)));

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) reset(); onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request roster change</DialogTitle>
          <DialogDescription>Submit a roster change for department and HR review. Department, position, and level are derived by HRM.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {canSelectEmployee ? (
            <Label className="grid gap-1 text-sm">Employee<EmployeeCombobox value={employeeId} onChange={(value) => { setEmployeeId(value ?? ""); setShiftId(""); }} /></Label>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              {currentEmployeeId ? "Requesting for your linked employee profile." : "Your employee profile is not linked to this login. Please contact HR."}
            </div>
          )}
          <Label className="grid gap-1 text-sm">Change type
            <Select value={changeType} onValueChange={setChangeType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{changeTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-sm md:col-span-2">Roster shift
            <Select value={shiftId || "none"} onValueChange={(value) => {
              const next = value === "none" ? "" : value;
              setShiftId(next);
              const shift = (shiftsQuery.data?.data ?? []).find((row) => row.id === next);
              if (shift) {
                setRequestedDate(shift.roster_date);
                setRequestedStart(shift.start_time);
                setRequestedEnd(shift.end_time);
              }
            }}>
              <SelectTrigger><SelectValue placeholder={shiftsQuery.isLoading ? "Loading shifts..." : "Select a shift, if applicable"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific shift</SelectItem>
                {(shiftsQuery.data?.data ?? []).map((shift: RosterShift) => (
                  <SelectItem key={shift.id} value={shift.id}>{shift.roster_date} - {shift.employee_name ?? shift.employee_id} - {formatTimeRange(shift.start_time, shift.end_time)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          {selectedShift ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm md:col-span-2">
              Current shift: {selectedShift.roster_date} - {formatTimeRange(selectedShift.start_time, selectedShift.end_time)} - {label(selectedShift.status)}
            </div>
          ) : null}
          <Label className="grid gap-1 text-sm">Requested date<Input type="date" value={requestedDate} onChange={(event) => setRequestedDate(event.target.value)} /></Label>
          {timeChange ? (
            <>
              <Label className="grid gap-1 text-sm">Requested start<Input type="time" value={requestedStart} onChange={(event) => setRequestedStart(event.target.value)} /></Label>
              <Label className="grid gap-1 text-sm">Requested end<Input type="time" value={requestedEnd} onChange={(event) => setRequestedEnd(event.target.value)} /></Label>
            </>
          ) : (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground md:col-span-2">
              {changeType === "SHIFT_SWAP" ? "Shift swap records the request now; final swap matching can be completed by roster approvers." :
                changeType === "DAY_OFF_REQUEST" ? "Day-off request records the requested date for roster approver review." :
                  "Use the reason field to describe the roster change needed."}
            </p>
          )}
          <Label className="grid gap-1 text-sm md:col-span-2">Reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>Submit for approval</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
