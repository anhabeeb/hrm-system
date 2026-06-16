import { Badge } from "@/components/ui/badge";
import type { DepartmentWeeklyTeamResponse } from "./departmentWeeklyTeam.types";

export const DepartmentWeeklyTeamHeader = ({ data, selfService }: { data?: DepartmentWeeklyTeamResponse; selfService?: boolean }) => (
  <section className="rounded-lg border bg-white p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{selfService ? "My Department Dashboard" : "Department Dashboard"}</p>
    <div className="mt-1 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly Team View</h1>
        <p className="text-sm text-muted-foreground">Compact attendance and coverage matrix for one department and one week.</p>
      </div>
      {data ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{data.department.name ?? "Selected department"}</Badge>
          <Badge variant="outline">{data.week.start_date} - {data.week.end_date}</Badge>
        </div>
      ) : null}
    </div>
  </section>
);
