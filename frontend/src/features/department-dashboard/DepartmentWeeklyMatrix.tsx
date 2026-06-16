import { Badge } from "@/components/ui/badge";
import type { DepartmentWeeklyCell, DepartmentWeeklyEmployee, DepartmentWeeklyTeamResponse } from "./departmentWeeklyTeam.types";
import { DepartmentWeeklyDayCell } from "./DepartmentWeeklyDayCell";

export const DepartmentWeeklyMatrix = ({
  data,
  onCellOpen,
}: {
  data: DepartmentWeeklyTeamResponse;
  onCellOpen: (employee: DepartmentWeeklyEmployee, cell: DepartmentWeeklyCell) => void;
}) => (
  <div className="overflow-x-auto rounded-lg border bg-white">
    <table className="min-w-[980px] w-full border-collapse text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          <th className="sticky left-0 z-10 w-60 border-b bg-slate-50 px-3 py-2 text-left">Employee</th>
          {data.week.days.map((day) => (
            <th key={day.date} className="w-32 border-b px-2 py-2 text-left">
              <div className="font-semibold text-foreground">{day.label}</div>
              <div>{day.date.slice(5)}</div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.employees.length === 0 ? (
          <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No employees found in this department.</td></tr>
        ) : data.employees.map((employee) => (
          <tr key={employee.id} className="border-t align-top">
            <td className="sticky left-0 z-10 border-r bg-white px-3 py-2">
              <div className="font-medium">{employee.name}</div>
              <div className="text-xs text-muted-foreground">{employee.employee_no ?? employee.id}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {employee.position_name ? <Badge variant="outline">{employee.position_name}</Badge> : null}
                {employee.level ? <Badge variant="outline">Level {employee.level}</Badge> : null}
              </div>
            </td>
            {employee.cells.map((cell) => (
              <td key={`${employee.id}-${cell.date}`} className="border-r px-2 py-2">
                <DepartmentWeeklyDayCell cell={cell} onOpen={() => onCellOpen(employee, cell)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
