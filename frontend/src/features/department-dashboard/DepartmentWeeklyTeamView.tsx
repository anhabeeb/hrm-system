import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingState } from "@/components/data/LoadingState";
import { friendlyOperationalError } from "@/lib/safe-display";
import { DepartmentDayDetailDrawer } from "./DepartmentDayDetailDrawer";
import { DepartmentTeamFilters } from "./DepartmentTeamFilters";
import { DepartmentWeeklyLegend } from "./DepartmentWeeklyLegend";
import { DepartmentWeeklyMatrix } from "./DepartmentWeeklyMatrix";
import { DepartmentWeeklySummaryWidgets } from "./DepartmentWeeklySummaryWidgets";
import { DepartmentWeeklyTeamHeader } from "./DepartmentWeeklyTeamHeader";
import { departmentWeeklyTeamApi } from "./departmentWeeklyTeam.api";
import type { DepartmentWeeklyCell, DepartmentWeeklyEmployee, DepartmentWeeklyTeamFilters } from "./departmentWeeklyTeam.types";
import { currentWeekStart } from "./departmentWeeklyTeam.utils";

export const DepartmentWeeklyTeamView = ({ selfService = false }: { selfService?: boolean }) => {
  const [filters, setFilters] = useState<DepartmentWeeklyTeamFilters>({ week_start: currentWeekStart() });
  const [selected, setSelected] = useState<{ employee: DepartmentWeeklyEmployee; cell: DepartmentWeeklyCell } | null>(null);
  const departmentsQuery = useQuery({
    queryKey: ["departments", "weekly-team-selector"],
    queryFn: () => selfService ? departmentWeeklyTeamApi.selfDepartments() : departmentWeeklyTeamApi.departments(),
  });
  const departments = departmentsQuery.data?.data ?? [];
  const effectiveFilters = useMemo(() => {
    if (selfService) return filters;
    return { ...filters, department_id: filters.department_id ?? departments[0]?.id };
  }, [departments, filters, selfService]);
  const query = useQuery({
    queryKey: ["department-weekly-team", selfService ? "self" : "admin", effectiveFilters],
    queryFn: () => selfService ? departmentWeeklyTeamApi.self(effectiveFilters) : departmentWeeklyTeamApi.admin(effectiveFilters),
    enabled: selfService || Boolean(effectiveFilters.department_id),
  });
  const data = query.data?.data;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <DepartmentWeeklyTeamHeader data={data} selfService={selfService} />
      <DepartmentTeamFilters filters={filters} departments={departments} selfService={selfService} onChange={setFilters} />
      {query.isLoading || departmentsQuery.isLoading ? <LoadingState rows={6} /> : null}
      {query.isError ? <InlineAlert title={friendlyOperationalError(query.error, "Department weekly team view could not be loaded.")} variant="error" /> : null}
      {data?.warnings?.length ? <InlineAlert title={data.warnings[0]}>{data.warnings.slice(1).join(" ")}</InlineAlert> : null}
      {data ? (
        <>
          <DepartmentWeeklySummaryWidgets data={data} />
          <DepartmentWeeklyLegend />
          <DepartmentWeeklyMatrix data={data} onCellOpen={(employee, cell) => setSelected({ employee, cell })} />
        </>
      ) : !query.isLoading ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-muted-foreground">Select a department to view the weekly team attendance.</div>
      ) : null}
      <DepartmentDayDetailDrawer employee={selected?.employee ?? null} cell={selected?.cell ?? null} onClose={() => setSelected(null)} />
    </div>
  );
};
