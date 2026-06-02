import { FilterBar } from "@/components/data/FilterBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const UserFilters = ({ search, status, role, onChange, onClear }: {
  search?: string;
  status?: string;
  role?: string;
  onChange: (filters: { search?: string; status?: string; role?: string }) => void;
  onClear: () => void;
}) => (
  <FilterBar
    search={search}
    searchPlaceholder="Search users"
    onSearchChange={(value) => onChange({ search: value || undefined, status, role })}
    onClear={onClear}
    onApply={() => undefined}
  >
    <Select value={status ?? "all"} onValueChange={(value) => onChange({ search, role, status: value === "all" ? undefined : value })}>
      <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
      <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent>
    </Select>
    <Select value={role ?? "all"} onValueChange={(value) => onChange({ search, status, role: value === "all" ? undefined : value })}>
      <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
      <SelectContent><SelectItem value="all">All roles</SelectItem><SelectItem value="super_admin">Super Admin</SelectItem><SelectItem value="admin">Admin</SelectItem><SelectItem value="hr_manager">HR Manager</SelectItem><SelectItem value="outlet_manager">Outlet Manager</SelectItem></SelectContent>
    </Select>
  </FilterBar>
);
