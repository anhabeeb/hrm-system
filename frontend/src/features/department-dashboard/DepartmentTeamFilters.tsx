import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DepartmentWeeklyStatus, DepartmentWeeklyTeamDepartmentOption, DepartmentWeeklyTeamFilters } from "./departmentWeeklyTeam.types";
import { addDays, currentWeekStart } from "./departmentWeeklyTeam.utils";

const statuses: Array<{ value: DepartmentWeeklyStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
  { value: "LEAVE", label: "Leave" },
  { value: "SICK", label: "Sick" },
  { value: "DAY_OFF", label: "Day off" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "MISSING_PUNCH", label: "Missing punch" },
  { value: "PENDING_CORRECTION", label: "Pending correction" },
];

export const DepartmentTeamFilters = ({
  filters,
  departments,
  selfService,
  onChange,
}: {
  filters: DepartmentWeeklyTeamFilters;
  departments: DepartmentWeeklyTeamDepartmentOption[];
  selfService?: boolean;
  onChange: (filters: DepartmentWeeklyTeamFilters) => void;
}) => (
  <div className="flex flex-col gap-3 rounded-lg border bg-white p-3 md:flex-row md:items-end">
    {!selfService ? (
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Department</span>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={filters.department_id ?? ""}
          onChange={(event) => onChange({ ...filters, department_id: event.target.value || undefined })}
        >
          <option value="">Select department</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </label>
    ) : null}
    <label className="grid gap-1 text-sm">
      <span className="font-medium">Search employee</span>
      <Input value={filters.search ?? ""} onChange={(event) => onChange({ ...filters, search: event.target.value || undefined })} placeholder="Name, code, or position" />
    </label>
    <label className="grid gap-1 text-sm">
      <span className="font-medium">Status</span>
      <select
        className="h-9 rounded-md border bg-background px-3 text-sm"
        value={filters.status ?? ""}
        onChange={(event) => onChange({ ...filters, status: event.target.value as DepartmentWeeklyStatus | "" })}
      >
        {statuses.map((status) => <option key={status.value || "all"} value={status.value}>{status.label}</option>)}
      </select>
    </label>
    <div className="flex flex-wrap gap-2 md:ml-auto">
      <Button size="sm" variant="outline" onClick={() => onChange({ ...filters, week_start: addDays(filters.week_start ?? currentWeekStart(), -7) })}>Previous week</Button>
      <Button size="sm" variant="outline" onClick={() => onChange({ ...filters, week_start: currentWeekStart() })}>Current week</Button>
      <Button size="sm" variant="outline" onClick={() => onChange({ ...filters, week_start: addDays(filters.week_start ?? currentWeekStart(), 7) })}>Next week</Button>
    </div>
  </div>
);
