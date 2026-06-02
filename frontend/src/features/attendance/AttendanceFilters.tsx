import { FilterBar } from "@/components/data/FilterBar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AttendanceFilters as AttendanceFilterValues } from "./attendance.types";

const statuses = ["present", "absent", "checked_in", "missing_clock_in", "missing_clock_out", "conflict", "on_leave", "holiday", "off_day"];

export const AttendanceFilters = ({
  filters,
  onChange,
  onClear,
}: {
  filters: AttendanceFilterValues;
  onChange: (next: Partial<AttendanceFilterValues>) => void;
  onClear: () => void;
}) => (
  <FilterBar onClear={onClear} onApply={() => onChange({})}>
    <div className="space-y-1.5">
      <Label htmlFor="date-from">From</Label>
      <Input id="date-from" type="date" value={filters.date_from ?? ""} onChange={(event) => onChange({ date_from: event.target.value })} />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="date-to">To</Label>
      <Input id="date-to" type="date" value={filters.date_to ?? ""} onChange={(event) => onChange({ date_to: event.target.value })} />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="employee-id">Employee ID</Label>
      <Input id="employee-id" value={filters.employee_id ?? ""} placeholder="Employee ID" onChange={(event) => onChange({ employee_id: event.target.value })} />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="outlet-id">Outlet ID</Label>
      <Input id="outlet-id" value={filters.outlet_id ?? ""} placeholder="Outlet ID" onChange={(event) => onChange({ outlet_id: event.target.value })} />
    </div>
    <div className="space-y-1.5">
      <Label>Status</Label>
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger>
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {statuses.map((status) => (
            <SelectItem key={status} value={status}>
              {status.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="issue-type">Issue</Label>
      <Input id="issue-type" value={filters.issue_type ?? ""} placeholder="missing_clock_in" onChange={(event) => onChange({ issue_type: event.target.value })} />
    </div>
  </FilterBar>
);
