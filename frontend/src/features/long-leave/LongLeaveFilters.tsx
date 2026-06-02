import { FilterBar } from "@/components/data/FilterBar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LongLeaveFilters as LongLeaveFilterValues } from "./long-leave.types";

export const LongLeaveFilters = ({
  filters,
  onChange,
  onClear,
}: {
  filters: LongLeaveFilterValues;
  onChange: (filters: Partial<LongLeaveFilterValues>) => void;
  onClear: () => void;
}) => (
  <FilterBar
    search={filters.search}
    searchPlaceholder="Search employee or outlet"
    onSearchChange={(search) => onChange({ search })}
    onClear={onClear}
  >
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Status
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="returned">Returned</SelectItem>
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
  </FilterBar>
);
