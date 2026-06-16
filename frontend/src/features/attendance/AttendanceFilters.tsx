import { FilterBar } from "@/components/data/FilterBar";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
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
    <AppDateRangePicker
      dateFrom={filters.date_from}
      dateTo={filters.date_to}
      onChange={({ dateFrom, dateTo }) => onChange({ date_from: dateFrom, date_to: dateTo })}
    />
    <div className="space-y-1.5">
      <Label>Outlet</Label>
      <OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value, employee_id: undefined })} placeholder="All outlets" />
    </div>
    <div className="space-y-1.5">
      <Label>Employee</Label>
      <EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => onChange({ employee_id: value })} placeholder="All employees" />
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
