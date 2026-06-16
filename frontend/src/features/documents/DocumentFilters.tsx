import { FilterBar } from "@/components/data/FilterBar";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { documentStatusOptions, documentTypeOptions } from "./document-format";
import type { DocumentFilters as DocumentFilterValues } from "./documents.types";

const today = () => new Date().toISOString().slice(0, 10);

const expiryPresetValue = (filters: DocumentFilterValues) => {
  if (filters.expiring_within_days) return String(filters.expiring_within_days);
  if (filters.expiry_to === today()) return "expired";
  if (filters.expiry_from || filters.expiry_to) return "custom";
  return "all";
};

export const DocumentFilters = ({ filters, onChange, onClear }: { filters: DocumentFilterValues; onChange: (filters: Partial<DocumentFilterValues>) => void; onClear: () => void }) => {
  const expiryPreset = expiryPresetValue(filters);

  return (
    <FilterBar onClear={onClear}>
      <Label className="space-y-1 text-xs font-medium text-muted-foreground">
        Document type
        <Select value={filters.document_type ?? "all"} onValueChange={(value) => onChange({ document_type: value === "all" ? undefined : value })}>
          <SelectTrigger><SelectValue placeholder="All document types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All document types</SelectItem>
            {documentTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Label>
      <Label className="space-y-1 text-xs font-medium text-muted-foreground">
        Status
        <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
          <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {documentStatusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Label>
      <Label className="space-y-1 text-xs font-medium text-muted-foreground">
        Employee type
        <Select value={filters.employee_type ?? "all"} onValueChange={(value) => onChange({ employee_type: value === "all" ? undefined : value })}>
          <SelectTrigger><SelectValue placeholder="All employee types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employee types</SelectItem>
            <SelectItem value="local">Local</SelectItem>
            <SelectItem value="foreign">Foreign</SelectItem>
          </SelectContent>
        </Select>
      </Label>
      <Label className="space-y-1 text-xs font-medium text-muted-foreground">
        Expiry
        <Select
          value={expiryPreset}
          onValueChange={(value) => {
            if (value === "all") onChange({ expiring_within_days: undefined, expiry_from: undefined, expiry_to: undefined });
            else if (value === "expired") onChange({ expiring_within_days: undefined, expiry_from: undefined, expiry_to: today() });
            else if (value === "custom") onChange({ expiring_within_days: undefined });
            else onChange({ expiring_within_days: Number(value), expiry_from: undefined, expiry_to: undefined });
          }}
        >
          <SelectTrigger><SelectValue placeholder="All expiry dates" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All expiry dates</SelectItem>
            <SelectItem value="30">Expiring within 30 days</SelectItem>
            <SelectItem value="60">Expiring within 60 days</SelectItem>
            <SelectItem value="90">Expiring within 90 days</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="custom">Custom date range</SelectItem>
          </SelectContent>
        </Select>
      </Label>
      {expiryPreset === "custom" ? (
        <AppDateRangePicker
          dateFrom={filters.expiry_from}
          dateTo={filters.expiry_to}
          onChange={({ dateFrom, dateTo }) => onChange({ expiry_from: dateFrom, expiry_to: dateTo })}
        />
      ) : null}
      <Label className="space-y-1 text-xs font-medium text-muted-foreground">Employee<EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => onChange({ employee_id: value })} placeholder="All employees" /></Label>
      <Label className="space-y-1 text-xs font-medium text-muted-foreground">Outlet<OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" /></Label>
    </FilterBar>
  );
};
