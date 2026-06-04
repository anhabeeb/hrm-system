import { FilterBar } from "@/components/data/FilterBar";
import { OutletCombobox } from "@/components/selectors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PayrollFilters as PayrollFilterValues } from "./payroll.types";

export const PayrollFilters = ({
  filters,
  onChange,
  onClear,
}: {
  filters: PayrollFilterValues;
  onChange: (filters: Partial<PayrollFilterValues>) => void;
  onClear: () => void;
}) => (
  <FilterBar onClear={onClear}>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Payroll month
      <Input type="month" value={filters.payroll_month ?? ""} onChange={(event) => onChange({ payroll_month: event.target.value })} />
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Status
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="locked">Locked</SelectItem>
          <SelectItem value="reopened">Reopened</SelectItem>
        </SelectContent>
      </Select>
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Outlet
      <OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value })} placeholder="All accessible outlets" />
    </Label>
  </FilterBar>
);
