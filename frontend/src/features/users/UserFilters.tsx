import { FilterBar } from "@/components/data/FilterBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Role } from "@/features/roles/roles.types";

export const UserFilters = ({ search, status, roleId, roles = [], onChange, onClear }: {
  search?: string;
  status?: string;
  roleId?: string;
  roles?: Role[];
  onChange: (filters: { search?: string; status?: string; role_id?: string }) => void;
  onClear: () => void;
}) => (
  <FilterBar
    search={search}
    searchPlaceholder="Search users"
    onSearchChange={(value) => onChange({ search: value || undefined, status, role_id: roleId })}
    onClear={onClear}
    onApply={() => undefined}
  >
    <Select value={status ?? "all"} onValueChange={(value) => onChange({ search, role_id: roleId, status: value === "all" ? undefined : value })}>
      <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
      <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem><SelectItem value="pending">Pending</SelectItem></SelectContent>
    </Select>
    <Select value={roleId ?? "all"} onValueChange={(value) => onChange({ search, status, role_id: value === "all" ? undefined : value })}>
      <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All roles</SelectItem>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>{role.role_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </FilterBar>
);
