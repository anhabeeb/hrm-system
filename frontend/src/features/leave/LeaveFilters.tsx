import { FilterBar } from "@/components/data/FilterBar";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { EmployeeCombobox, LeaveTypeCombobox, OutletCombobox } from "@/components/selectors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LeaveFilters as LeaveFilterValues } from "./leave.types";

export const LeaveFilters = ({ filters, onChange, onClear }: { filters: LeaveFilterValues; onChange: (next: Partial<LeaveFilterValues>) => void; onClear: () => void }) => (
  <FilterBar search={filters.search} searchPlaceholder="Search leave" onSearchChange={(search) => onChange({ search })} onClear={onClear} onApply={() => onChange({})}>
    <div className="space-y-1.5"><Label>Outlet</Label><OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value, employee_id: undefined })} placeholder="All outlets" /></div>
    <div className="space-y-1.5"><Label>Employee</Label><EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => onChange({ employee_id: value })} placeholder="All employees" /></div>
    <div className="space-y-1.5"><Label>Leave type</Label><LeaveTypeCombobox value={filters.leave_type_id} onChange={(value) => onChange({ leave_type_id: value })} placeholder="All leave types" /></div>
    <div className="space-y-1.5"><Label>Status</Label><Input value={filters.status ?? ""} onChange={(event) => onChange({ status: event.target.value })} /></div>
    <AppDateRangePicker
      dateFrom={filters.date_from}
      dateTo={filters.date_to}
      fromLabel="Date From"
      toLabel="Date To"
      onChange={({ dateFrom, dateTo }) => onChange({ date_from: dateFrom, date_to: dateTo })}
    />
  </FilterBar>
);
