import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RosterWeeklyMatrixFilters } from "./rosterWeeklyMatrix.types";
import { addDays, currentWeekStart, rosterStatusOptions } from "./rosterWeeklyMatrix.utils";

export const RosterWeeklyMatrixHeader = ({
  filters,
  onChange,
}: {
  filters: RosterWeeklyMatrixFilters;
  onChange: (filters: RosterWeeklyMatrixFilters) => void;
}) => {
  const weekStart = filters.week_start ?? currentWeekStart();
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            Roster Weekly Matrix
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Plan and review shifts for the selected week. Approval-bound changes go through roster change requests.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onChange({ ...filters, week_start: addDays(weekStart, -7) })}>Previous week</Button>
          <Button size="sm" variant="outline" onClick={() => onChange({ ...filters, week_start: currentWeekStart() })}>Current week</Button>
          <Button size="sm" variant="outline" onClick={() => onChange({ ...filters, week_start: addDays(weekStart, 7) })}>Next week</Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Week start
          <Input type="date" value={weekStart} onChange={(event) => onChange({ ...filters, week_start: event.target.value })} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Search employee
          <Input value={filters.search ?? ""} onChange={(event) => onChange({ ...filters, search: event.target.value || undefined })} placeholder="Name, code, department, position" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filters.status ?? ""} onChange={(event) => onChange({ ...filters, status: event.target.value as RosterWeeklyMatrixFilters["status"] })}>
            {rosterStatusOptions.map((status) => <option key={status.value || "all"} value={status.value}>{status.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Department ID
          <Input value={filters.department_id ?? ""} onChange={(event) => onChange({ ...filters, department_id: event.target.value || undefined })} placeholder="Optional scoped department" />
        </label>
      </div>
    </div>
  );
};
