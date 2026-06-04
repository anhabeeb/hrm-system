import { FilterBar } from "@/components/data/FilterBar";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PayslipFilters as PayslipFilterValues } from "./payslips.types";

export const PayslipFilters = ({
  filters,
  onChange,
  onClear,
}: {
  filters: PayslipFilterValues;
  onChange: (filters: Partial<PayslipFilterValues>) => void;
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
          <SelectItem value="generated">Generated</SelectItem>
          <SelectItem value="published">Published</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
        </SelectContent>
      </Select>
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Outlet
      <OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" />
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Employee
      <EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => onChange({ employee_id: value })} placeholder="All employees" />
    </Label>
  </FilterBar>
);
