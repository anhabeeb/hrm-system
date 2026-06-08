import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { OutletCombobox } from "@/components/selectors";
import { lookupApi, type LookupOption } from "@/components/selectors/lookup-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { ManualAttendanceBatchPayload, ManualAttendanceBatchResult, ManualAttendanceBatchRowError } from "./attendance.types";

const statuses = ["present", "absent", "on_leave", "holiday", "off_day", "checked_in", "missing_clock_in", "missing_clock_out", "conflict"];

interface BatchRow {
  employee: LookupOption;
  included: boolean;
  clock_in_time: string;
  clock_out_time: string;
  status: string;
  note: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const ManualAttendanceBatchDialog = ({
  open,
  initial,
  loading,
  error,
  result,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initial?: { outlet_id?: string; employee_id?: string; attendance_date?: string };
  loading?: boolean;
  error?: unknown;
  result?: ManualAttendanceBatchResult;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ManualAttendanceBatchPayload) => void;
}) => {
  const [outletId, setOutletId] = useState(initial?.outlet_id ?? "");
  const [attendanceDate, setAttendanceDate] = useState(initial?.attendance_date ?? todayIso());
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOutletId(initial?.outlet_id ?? "");
    setAttendanceDate(initial?.attendance_date ?? todayIso());
    setReason("");
    setSearch("");
    setRows([]);
    setLocalError(null);
  }, [initial?.attendance_date, initial?.employee_id, initial?.outlet_id, open]);

  const employeesQuery = useQuery({
    queryKey: ["lookup", "manual-attendance-employees", outletId, search],
    queryFn: () => lookupApi.employees({ outlet_id: outletId, search, page_size: 50 }),
    enabled: open && Boolean(outletId),
  });

  useEffect(() => {
    const employees = employeesQuery.data?.data ?? [];
    setRows((current) => {
      const byId = new Map(current.map((row) => [row.employee.id, row]));
      return employees.map((employee) => {
        const existing = byId.get(employee.id);
        if (existing) return { ...existing, employee };
        return {
          employee,
          included: initial?.employee_id ? employee.id === initial.employee_id : false,
          clock_in_time: "",
          clock_out_time: "",
          status: "",
          note: "",
        };
      });
    });
  }, [employeesQuery.data?.data, initial?.employee_id]);

  const rowErrors = useMemo(() => {
    const byEmployee = new Map<string, ManualAttendanceBatchRowError[]>();
    for (const rowError of result?.row_errors ?? []) {
      if (!rowError.employee_id) continue;
      byEmployee.set(rowError.employee_id, [...(byEmployee.get(rowError.employee_id) ?? []), rowError]);
    }
    return byEmployee;
  }, [result?.row_errors]);

  const updateRow = (employeeId: string, patch: Partial<BatchRow>) => {
    setRows((current) => current.map((row) => row.employee.id === employeeId ? { ...row, ...patch } : row));
  };

  const submit = () => {
    if (!outletId) return setLocalError("Select an outlet before loading employees.");
    if (!attendanceDate) return setLocalError("Attendance date is required.");
    if (!reason.trim()) return setLocalError("Reason is required.");
    const entries = rows
      .filter((row) => row.included)
      .map((row) => ({
        employee_id: row.employee.id,
        clock_in_time: row.clock_in_time || undefined,
        clock_out_time: row.clock_out_time || undefined,
        status: row.status || undefined,
        note: row.note || undefined,
      }));
    if (entries.length === 0) return setLocalError("Select at least one employee row.");
    const missingValue = entries.find((entry) => !entry.clock_in_time && !entry.clock_out_time && !entry.status);
    if (missingValue) return setLocalError("Every selected row needs a clock time or status.");
    setLocalError(null);
    onSubmit({ outlet_id: outletId, attendance_date: attendanceDate, reason, entries });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Manual attendance by outlet</DialogTitle>
          <DialogDescription>Select an outlet, review assigned employees, then submit multiple manual attendance entries in one batch. Approved leave and roster-rule warnings are shown after the rules engine reviews each row.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1.4fr]">
          <Label className="space-y-1.5 text-sm">Outlet<OutletCombobox value={outletId} onChange={(value) => { setOutletId(value ?? ""); setRows([]); }} placeholder="Select outlet first" /></Label>
          <Label className="space-y-1.5 text-sm">Attendance date<Input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></Label>
          <Label className="space-y-1.5 text-sm">Search employees<Input disabled={!outletId} value={search} placeholder="Search employee code or name" onChange={(event) => setSearch(event.target.value)} /></Label>
        </div>
        <Label className="space-y-1.5 text-sm">Reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
        {!outletId ? (
          <div className="rounded-lg border bg-muted/40 p-6 text-sm text-muted-foreground">Select an outlet to load assigned employees.</div>
        ) : (
          <div className="max-h-[460px] overflow-auto rounded-lg border">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-12 px-3 py-2">Use</th>
                  <th className="px-3 py-2">Employee ID</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Expected shift</th>
                  <th className="px-3 py-2">Clock in</th>
                  <th className="px-3 py-2">Clock out</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {employeesQuery.isLoading ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading employees...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No employees found for this outlet.</td></tr>
                ) : rows.map((row) => {
                  const errors = rowErrors.get(row.employee.id) ?? [];
                  return (
                    <tr key={row.employee.id} className="border-t align-top">
                      <td className="px-3 py-2"><Checkbox checked={row.included} onCheckedChange={(checked) => updateRow(row.employee.id, { included: Boolean(checked) })} /></td>
                      <td className="px-3 py-2 font-medium">{row.employee.code ?? row.employee.id}</td>
                      <td className="px-3 py-2">
                        <div>{row.employee.name}</div>
                        {errors.map((rowError) => <div key={`${rowError.code}-${rowError.index}`} className="mt-1 text-xs text-destructive">{rowError.message}</div>)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">Roster shift shown after attendance rules sync</td>
                      <td className="px-3 py-2"><Input type="time" value={row.clock_in_time} onChange={(event) => updateRow(row.employee.id, { clock_in_time: event.target.value, included: true })} /></td>
                      <td className="px-3 py-2"><Input type="time" value={row.clock_out_time} onChange={(event) => updateRow(row.employee.id, { clock_out_time: event.target.value, included: true })} /></td>
                      <td className="px-3 py-2">
                        <Select value={row.status || "none"} onValueChange={(value) => updateRow(row.employee.id, { status: value === "none" ? "" : value, included: value !== "none" || row.included })}>
                          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No status</SelectItem>
                            {statuses.map((status) => <SelectItem key={status} value={status}>{status.replace(/_/g, " ")}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2"><Input value={row.note} onChange={(event) => updateRow(row.employee.id, { note: event.target.value, included: true })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {result?.row_errors?.length ? <FormError message={`${result.row_errors.length} row(s) need review before they can be saved.`} /> : null}
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Manual attendance batch could not be submitted.")} /> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>Submit selected rows</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
