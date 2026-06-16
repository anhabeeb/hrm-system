import type { RosterMatrixCell, RosterMatrixEmployee, RosterWeeklyMatrixResponse } from "./rosterWeeklyMatrix.types";
import { RosterEmployeeRow } from "./RosterEmployeeRow";

export const RosterWeeklyMatrix = ({
  data,
  onCellOpen,
}: {
  data: RosterWeeklyMatrixResponse;
  onCellOpen: (employee: RosterMatrixEmployee, cell: RosterMatrixCell) => void;
}) => (
  <div className="overflow-x-auto rounded-lg border bg-white">
    <table className="min-w-[1080px] w-full border-collapse text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          <th className="sticky left-0 z-10 w-64 border-b bg-slate-50 px-3 py-2 text-left">Employee</th>
          {data.week.days.map((day) => (
            <th key={day.date} className="w-36 border-b px-2 py-2 text-left">
              <div className="font-semibold text-foreground">{day.label}{day.is_holiday ? " / Holiday" : ""}</div>
              <div>{day.date.slice(5)}{day.is_today ? " / Today" : ""}</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.employees.length === 0 ? (
          <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">No employees found for this roster scope.</td></tr>
        ) : data.employees.map((employee) => (
          <RosterEmployeeRow key={employee.id} employee={employee} onCellOpen={onCellOpen} />
        ))}
      </tbody>
    </table>
  </div>
);
