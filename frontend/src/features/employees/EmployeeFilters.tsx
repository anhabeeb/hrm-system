import { FilterBar } from "@/components/data/FilterBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Department } from "@/features/departments/departments.types";
import type { Outlet } from "@/features/outlets/outlets.types";
import type { Position } from "@/features/positions/positions.types";

export interface EmployeeFilterValues {
  search?: string;
  outlet_id?: string;
  department_id?: string;
  position_id?: string;
  employee_type?: string;
  employment_status?: string;
}

export const EmployeeFilters = ({
  filters,
  outlets,
  departments,
  positions,
  onChange,
  onClear,
}: {
  filters: EmployeeFilterValues;
  outlets: Outlet[];
  departments: Department[];
  positions: Position[];
  onChange: (filters: EmployeeFilterValues) => void;
  onClear: () => void;
}) => {
  const update = (key: keyof EmployeeFilterValues, value: string) =>
    onChange({ ...filters, [key]: value === "all" ? undefined : value });

  return (
    <FilterBar
      search={filters.search}
      searchPlaceholder="Search employees"
      onSearchChange={(search) => onChange({ ...filters, search: search || undefined })}
      onClear={onClear}
      onApply={() => undefined}
    >
      <Select value={filters.outlet_id ?? "all"} onValueChange={(value) => update("outlet_id", value)}>
        <SelectTrigger><SelectValue placeholder="Outlet" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All outlets</SelectItem>
          {outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.department_id ?? "all"} onValueChange={(value) => update("department_id", value)}>
        <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All departments</SelectItem>
          {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.position_id ?? "all"} onValueChange={(value) => update("position_id", value)}>
        <SelectTrigger><SelectValue placeholder="Position" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All positions</SelectItem>
          {positions.map((position) => <SelectItem key={position.id} value={position.id}>{position.title}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.employee_type ?? "all"} onValueChange={(value) => update("employee_type", value)}>
        <SelectTrigger><SelectValue placeholder="Employee type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All employee types</SelectItem>
          <SelectItem value="local">Local</SelectItem>
          <SelectItem value="foreign">Foreign</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filters.employment_status ?? "all"} onValueChange={(value) => update("employment_status", value)}>
        <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {["active", "probation", "confirmed", "on_leave", "long_leave", "suspended", "resigned", "terminated", "retired", "inactive", "rehired", "archived"].map((status) => (
            <SelectItem key={status} value={status}>{status.replace(/_/g, " ")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterBar>
  );
};
