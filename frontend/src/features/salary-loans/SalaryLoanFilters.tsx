import { FilterBar } from "@/components/data/FilterBar";
import { AppMonthPicker } from "@/components/forms/AppMonthPicker";
import { OutletCombobox } from "@/components/selectors";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SalaryLoanFilters as SalaryLoanFilterValues } from "./salary-loans.types";

export const SalaryLoanFilters = ({
  filters,
  onChange,
  onClear,
}: {
  filters: SalaryLoanFilterValues;
  onChange: (filters: Partial<SalaryLoanFilterValues>) => void;
  onClear: () => void;
}) => (
  <FilterBar onClear={onClear}>
    <AppMonthPicker label="Start month" value={filters.start_month} onChange={(value) => onChange({ start_month: value })} />
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Status
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="paused">Paused</SelectItem>
          <SelectItem value="settled">Settled</SelectItem>
        </SelectContent>
      </Select>
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Outlet
      <OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value })} placeholder="All accessible outlets" />
    </Label>
  </FilterBar>
);
