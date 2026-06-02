import { FilterBar } from "@/components/data/FilterBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const OutletFilters = ({ search, status, onChange, onClear }: {
  search?: string;
  status?: string;
  onChange: (values: { search?: string; status?: string }) => void;
  onClear: () => void;
}) => (
  <FilterBar
    search={search}
    searchPlaceholder="Search outlets"
    onSearchChange={(value) => onChange({ search: value || undefined, status })}
    onClear={onClear}
    onApply={() => undefined}
  >
    <Select value={status ?? "all"} onValueChange={(value) => onChange({ search, status: value === "all" ? undefined : value })}>
      <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
      <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent>
    </Select>
  </FilterBar>
);
