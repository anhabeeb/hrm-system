import { FilterBar } from "@/components/data/FilterBar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DeviceFilters as DeviceFilterValues } from "./devices.types";

export const DeviceFilters = ({ filters, onChange, onClear }: { filters: DeviceFilterValues; onChange: (next: Partial<DeviceFilterValues>) => void; onClear: () => void }) => (
  <FilterBar search={filters.search} searchPlaceholder="Search devices" onSearchChange={(search) => onChange({ search })} onClear={onClear} onApply={() => onChange({})}>
    <div className="space-y-1.5">
      <Label htmlFor="device-outlet">Outlet ID</Label>
      <Input id="device-outlet" value={filters.outlet_id ?? ""} onChange={(event) => onChange({ outlet_id: event.target.value })} />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="device-type">Device type</Label>
      <Input id="device-type" value={filters.device_type ?? ""} placeholder="kiosk" onChange={(event) => onChange({ device_type: event.target.value })} />
    </div>
    <div className="space-y-1.5">
      <Label>Status</Label>
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="disabled">Disabled</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </FilterBar>
);
