import { Badge } from "@/components/ui/badge";
import type { RosterMatrixCell, RosterMatrixEmployee } from "./rosterWeeklyMatrix.types";
import { RosterDayCell } from "./RosterDayCell";

export const RosterEmployeeRow = ({
  employee,
  onCellOpen,
}: {
  employee: RosterMatrixEmployee;
  onCellOpen: (employee: RosterMatrixEmployee, cell: RosterMatrixCell) => void;
}) => (
  <tr className="border-t align-top">
    <td className="sticky left-0 z-10 border-r bg-white px-3 py-2">
      <div className="font-medium">{employee.name}</div>
      <div className="text-xs text-muted-foreground">{employee.employee_no ?? employee.id}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {employee.department_name ? <Badge variant="outline">{employee.department_name}</Badge> : null}
        {employee.position_name ? <Badge variant="outline">{employee.position_name}</Badge> : null}
        {employee.level ? <Badge variant="outline">Level {employee.level}</Badge> : null}
      </div>
    </td>
    {employee.cells.map((cell) => (
      <td key={`${employee.id}-${cell.date}`} className="border-r px-2 py-2">
        <RosterDayCell cell={cell} onOpen={() => onCellOpen(employee, cell)} />
      </td>
    ))}
  </tr>
);
