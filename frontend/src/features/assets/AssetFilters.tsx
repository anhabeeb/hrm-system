import { FilterBar } from "@/components/data/FilterBar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AssetFilters as AssetFilterValues } from "./assets.types";

export const AssetFilters = ({ filters, onChange, onClear }: { filters: AssetFilterValues; onChange: (filters: Partial<AssetFilterValues>) => void; onClear: () => void }) => (
  <FilterBar search={filters.search} searchPlaceholder="Search assets" onSearchChange={(search) => onChange({ search })} onClear={onClear}>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Status
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="available">Available</SelectItem>
          <SelectItem value="issued">Issued</SelectItem>
          <SelectItem value="lost">Lost</SelectItem>
          <SelectItem value="damaged">Damaged</SelectItem>
          <SelectItem value="returned">Returned</SelectItem>
        </SelectContent>
      </Select>
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Asset type<Input value={filters.asset_type ?? ""} onChange={(event) => onChange({ asset_type: event.target.value })} /></Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Outlet ID<Input value={filters.outlet_id ?? ""} onChange={(event) => onChange({ outlet_id: event.target.value })} /></Label>
  </FilterBar>
);
