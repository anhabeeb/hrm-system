import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { useToast } from "@/components/feedback/useToast";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { rosterWeeklyMatrixApi } from "./rosterWeeklyMatrix.api";
import type { RosterMatrixCell, RosterMatrixChange, RosterMatrixEmployee, RosterWeeklyMatrixFilters } from "./rosterWeeklyMatrix.types";
import { currentWeekStart } from "./rosterWeeklyMatrix.utils";
import { RosterBulkAssignDialog } from "./RosterBulkAssignDialog";
import { RosterCellEditorDrawer } from "./RosterCellEditorDrawer";
import { RosterConflictPanel } from "./RosterConflictPanel";
import { RosterCopyWeekDialog } from "./RosterCopyWeekDialog";
import { RosterMatrixLegend } from "./RosterMatrixLegend";
import { RosterMatrixToolbar } from "./RosterMatrixToolbar";
import { RosterWeeklyMatrix } from "./RosterWeeklyMatrix";
import { RosterWeeklyMatrixHeader } from "./RosterWeeklyMatrixHeader";
import { RosterWeeklySummaryWidgets } from "./RosterWeeklySummaryWidgets";

export const RosterWeeklyMatrixPage = ({
  filters: externalFilters,
  onFiltersChange,
}: {
  filters?: RosterWeeklyMatrixFilters;
  onFiltersChange?: (filters: RosterWeeklyMatrixFilters) => void;
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [localFilters, setLocalFilters] = useState<RosterWeeklyMatrixFilters>({ week_start: currentWeekStart() });
  const filters = { ...localFilters, ...externalFilters, week_start: externalFilters?.week_start ?? localFilters.week_start ?? currentWeekStart() };
  const setFilters = (next: RosterWeeklyMatrixFilters) => {
    setLocalFilters(next);
    onFiltersChange?.(next);
  };
  const [selected, setSelected] = useState<{ employee: RosterMatrixEmployee; cell: RosterMatrixCell } | null>(null);
  const [changes, setChanges] = useState<RosterMatrixChange[]>([]);
  const [copyOpen, setCopyOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const query = useQuery({ queryKey: ["roster-weekly-matrix", filters], queryFn: () => rosterWeeklyMatrixApi.get(filters) });
  const data = query.data?.data;
  const payload = () => ({
    week_start: filters.week_start,
    department_id: filters.department_id ?? null,
    outlet_id: filters.outlet_id ?? null,
    changes,
    reason: "Roster weekly matrix update.",
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["roster-weekly-matrix"] }),
      queryClient.invalidateQueries({ queryKey: ["rosters"] }),
      queryClient.invalidateQueries({ queryKey: ["roster-changes"] }),
    ]);
  };

  const validateMutation = useMutation({
    mutationFn: () => rosterWeeklyMatrixApi.validate(payload()),
    onSuccess: (result) => toast.success(result.data.valid ? "Roster matrix changes are valid." : "Roster matrix conflicts need review."),
    onError: (error) => toast.error(friendlyHrmError(error, "Roster matrix changes could not be validated.")),
  });
  const draftMutation = useMutation({
    mutationFn: () => rosterWeeklyMatrixApi.saveDraft(payload()),
    onSuccess: async (result) => {
      toast.success(`Roster draft saved (${result.data.saved_count} shift${result.data.saved_count === 1 ? "" : "s"}).`);
      setChanges([]);
      await invalidate();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Roster draft could not be saved.")),
  });
  const submitMutation = useMutation({
    mutationFn: () => rosterWeeklyMatrixApi.submit(payload()),
    onSuccess: async (result) => {
      toast.success(`Roster changes submitted (${result.data.submitted_count}).`);
      setChanges([]);
      await invalidate();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Roster matrix changes could not be submitted.")),
  });
  const copyMutation = useMutation({
    mutationFn: () => rosterWeeklyMatrixApi.copyPreviousWeek({ ...payload(), changes: [] }),
    onSuccess: (result) => {
      setChanges(result.data.proposed_changes);
      setCopyOpen(false);
      toast.success(`Copied ${result.data.proposed_changes.length} proposed change${result.data.proposed_changes.length === 1 ? "" : "s"} from previous week.`);
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Previous week roster could not be copied.")),
  });
  const bulkMutation = useMutation({
    mutationFn: (bulkChanges: RosterMatrixChange[]) => rosterWeeklyMatrixApi.bulkAssign({ ...payload(), changes: bulkChanges }),
    onSuccess: (_result, bulkChanges) => {
      setChanges((current) => {
        const next = [...current];
        bulkChanges.forEach((change) => {
          const index = next.findIndex((item) => item.employee_id === change.employee_id && item.date === change.date);
          if (index >= 0) next[index] = change;
          else next.push(change);
        });
        return next;
      });
      toast.success(`Bulk assignment staged (${bulkChanges.length} change${bulkChanges.length === 1 ? "" : "s"}).`);
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Bulk roster assignment could not be staged.")),
  });

  const upsertChange = (change: RosterMatrixChange) => {
    setChanges((current) => [
      ...current.filter((item) => !(item.employee_id === change.employee_id && item.date === change.date)),
      change,
    ]);
    setSelected(null);
    toast.success("Roster matrix change staged locally.");
  };

  return (
    <div className="space-y-4">
      <RosterWeeklyMatrixHeader filters={filters} onChange={setFilters} />
      {query.error ? <InlineAlert variant="error" title={friendlyHrmError(query.error, "Roster weekly matrix could not be loaded.")} /> : null}
      {data?.warnings.length ? <InlineAlert variant="warning" title={data.warnings.join(" ")} /> : null}
      {data ? <RosterWeeklySummaryWidgets summary={data.summary} /> : null}
      <RosterMatrixToolbar
        permissions={data?.permissions}
        selectedCount={changes.length}
        onValidate={() => validateMutation.mutate()}
        onSaveDraft={() => draftMutation.mutate()}
        onSubmit={() => submitMutation.mutate()}
        onCopyWeek={() => setCopyOpen(true)}
        onBulkAssign={() => setBulkOpen(true)}
      />
      <WidgetCard title="Weekly matrix" description="Click a cell to review or stage an approval-aware roster change." loading={query.isLoading} empty={data && data.employees.length === 0 ? <p className="text-sm text-muted-foreground">No employees found for this roster scope.</p> : undefined}>
        {data ? <RosterWeeklyMatrix data={data} onCellOpen={(employee, cell) => setSelected({ employee, cell })} /> : null}
      </WidgetCard>
      <div className="grid gap-3 xl:grid-cols-[1fr_22rem]">
        <RosterMatrixLegend />
        <RosterConflictPanel data={data} />
      </div>
      <RosterCellEditorDrawer
        employee={selected?.employee ?? null}
        cell={selected?.cell ?? null}
        shifts={data?.shifts ?? []}
        permissions={data?.permissions}
        onClose={() => setSelected(null)}
        onSubmitChange={upsertChange}
      />
      <RosterCopyWeekDialog open={copyOpen} loading={copyMutation.isPending} onOpenChange={setCopyOpen} onConfirm={() => copyMutation.mutate()} />
      <RosterBulkAssignDialog open={bulkOpen} data={data} onOpenChange={setBulkOpen} onStageChanges={(bulkChanges) => bulkMutation.mutate(bulkChanges)} />
    </div>
  );
};
