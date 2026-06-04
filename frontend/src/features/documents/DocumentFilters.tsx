import { FilterBar } from "@/components/data/FilterBar";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DocumentFilters as DocumentFilterValues } from "./documents.types";

export const DocumentFilters = ({ filters, onChange, onClear }: { filters: DocumentFilterValues; onChange: (filters: Partial<DocumentFilterValues>) => void; onClear: () => void }) => (
  <FilterBar onClear={onClear}>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Document type<Input value={filters.document_type ?? ""} onChange={(event) => onChange({ document_type: event.target.value })} /></Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Status
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="valid">Valid</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="missing">Missing</SelectItem><SelectItem value="deleted">Deleted</SelectItem></SelectContent>
      </Select>
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Employee<EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => onChange({ employee_id: value })} placeholder="All employees" /></Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Outlet<OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" /></Label>
  </FilterBar>
);
