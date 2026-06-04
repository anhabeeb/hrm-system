import { FilterBar } from "@/components/data/FilterBar";
import { OutletCombobox } from "@/components/selectors";
import { Input } from "@/components/ui/input";
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
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Deduction month
      <Input type="month" value={filters.deduction_month ?? ""} onChange={(event) => onChange({ deduction_month: event.target.value })} />
    </Label>
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
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      From
      <Input type="date" value={filters.date_from ?? ""} onChange={(event) => onChange({ date_from: event.target.value })} />
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      To
      <Input type="date" value={filters.date_to ?? ""} onChange={(event) => onChange({ date_to: event.target.value })} />
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Outlet
      <OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value })} placeholder="All accessible outlets" />
    </Label>
  </FilterBar>
);
