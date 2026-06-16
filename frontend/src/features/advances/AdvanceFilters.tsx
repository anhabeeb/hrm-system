import { FilterBar } from "@/components/data/FilterBar";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { AppMonthPicker } from "@/components/forms/AppMonthPicker";
import { OutletCombobox } from "@/components/selectors";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdvanceFilters as AdvanceFilterValues } from "./advances.types";

export const AdvanceFilters = ({
  filters,
  onChange,
  onClear,
}: {
  filters: AdvanceFilterValues;
  onChange: (filters: Partial<AdvanceFilterValues>) => void;
  onClear: () => void;
}) => (
  <FilterBar onClear={onClear}>
    <AppMonthPicker label="Deduction month" value={filters.deduction_month} onChange={(value) => onChange({ deduction_month: value })} />
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Status
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>
    </Label>
    <AppDateRangePicker
      dateFrom={filters.date_from}
      dateTo={filters.date_to}
      onChange={({ dateFrom, dateTo }) => onChange({ date_from: dateFrom, date_to: dateTo })}
    />
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Outlet
      <OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value })} placeholder="All accessible outlets" />
    </Label>
  </FilterBar>
);
