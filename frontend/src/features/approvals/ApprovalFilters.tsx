import { FilterBar } from "@/components/data/FilterBar";
import { OutletCombobox } from "@/components/selectors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApprovalFilters as ApprovalFilterValues } from "./approvals.types";

export const ApprovalFilters = ({ filters, onChange, onClear }: { filters: ApprovalFilterValues; onChange: (filters: Partial<ApprovalFilterValues>) => void; onClear: () => void }) => (
  <FilterBar onClear={onClear}>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">
      Status
      <Select value={filters.status ?? "all"} onValueChange={(value) => onChange({ status: value === "all" ? undefined : value })}>
        <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem><SelectItem value="returned">Returned</SelectItem></SelectContent>
      </Select>
    </Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Module<Input value={filters.module ?? ""} onChange={(event) => onChange({ module: event.target.value })} /></Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Workflow key<Input value={filters.workflow_key ?? ""} onChange={(event) => onChange({ workflow_key: event.target.value })} /></Label>
    <Label className="space-y-1 text-xs font-medium text-muted-foreground">Outlet<OutletCombobox value={filters.outlet_id} onChange={(value) => onChange({ outlet_id: value })} placeholder="All accessible outlets" /></Label>
  </FilterBar>
);
