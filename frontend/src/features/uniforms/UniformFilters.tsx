import { FilterBar } from "@/components/data/FilterBar";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { UniformFilters as UniformFilterValues } from "./uniforms.types";

export const UniformFilters = ({ filters, onChange, onClear }: { filters: UniformFilterValues; onChange: (filters: Partial<UniformFilterValues>) => void; onClear: () => void }) => (
  <FilterBar onClear={onClear}>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Uniform type<Input value={filters.uniform_type ?? ""} onChange={(event) => onChange({ uniform_type: event.target.value })} /></Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Employee<EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => onChange({ employee_id: value })} placeholder="All employees" /></Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Outlet<OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" /></Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Status
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="issued">Issued</SelectItem><SelectItem value="returned">Returned</SelectItem><SelectItem value="pending_return">Pending return</SelectItem></SelectContent>
      </Select>
    </Label>
    <AppDateRangePicker
      dateFrom={filters.date_from}
      dateTo={filters.date_to}
      onChange={({ dateFrom, dateTo }) => onChange({ date_from: dateFrom, date_to: dateTo })}
    />
  </FilterBar>
);
