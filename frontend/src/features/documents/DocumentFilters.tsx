import { FilterBar } from "@/components/data/FilterBar";
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
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Employee ID<Input value={filters.employee_id ?? ""} onChange={(event) => onChange({ employee_id: event.target.value })} /></Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Outlet ID<Input value={filters.outlet_id ?? ""} onChange={(event) => onChange({ outlet_id: event.target.value })} /></Label>
  </FilterBar>
);
