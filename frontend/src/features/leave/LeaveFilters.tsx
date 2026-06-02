import { FilterBar } from "@/components/data/FilterBar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LeaveFilters as LeaveFilterValues } from "./leave.types";

export const LeaveFilters = ({ filters, onChange, onClear }: { filters: LeaveFilterValues; onChange: (next: Partial<LeaveFilterValues>) => void; onClear: () => void }) => (
  <FilterBar search={filters.search} searchPlaceholder="Search leave" onSearchChange={(search) => onChange({ search })} onClear={onClear} onApply={() => onChange({})}>
    <div className="space-y-1.5"><Label>Outlet ID</Label><Input value={filters.outlet_id ?? ""} onChange={(event) => onChange({ outlet_id: event.target.value })} /></div>
    <div className="space-y-1.5"><Label>Employee ID</Label><Input value={filters.employee_id ?? ""} onChange={(event) => onChange({ employee_id: event.target.value })} /></div>
    <div className="space-y-1.5"><Label>Status</Label><Input value={filters.status ?? ""} onChange={(event) => onChange({ status: event.target.value })} /></div>
    <div className="space-y-1.5"><Label>Date From</Label><Input type="date" value={filters.date_from ?? ""} onChange={(event) => onChange({ date_from: event.target.value })} /></div>
    <div className="space-y-1.5"><Label>Date To</Label><Input type="date" value={filters.date_to ?? ""} onChange={(event) => onChange({ date_to: event.target.value })} /></div>
  </FilterBar>
);
