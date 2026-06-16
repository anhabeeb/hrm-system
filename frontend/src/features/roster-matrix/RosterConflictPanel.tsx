import { AlertTriangle } from "lucide-react";

import { WidgetCard } from "@/components/widgets/WidgetCard";
import type { RosterWeeklyMatrixResponse } from "./rosterWeeklyMatrix.types";

export const RosterConflictPanel = ({ data }: { data?: RosterWeeklyMatrixResponse }) => {
  const cells = data?.employees.flatMap((employee) =>
    employee.cells
      .filter((cell) => cell.errors.length || cell.warnings.length)
      .map((cell) => ({ employee: employee.name, date: cell.date, messages: cell.errors.concat(cell.warnings) })),
  ) ?? [];

  return (
    <WidgetCard
      title="Conflict panel"
      description="Warnings and blockers found in the visible roster week."
      icon={<AlertTriangle className="h-4 w-4" />}
      empty={cells.length === 0 ? <p className="text-sm text-muted-foreground">No roster conflicts in the current matrix view.</p> : undefined}
    >
      <div className="space-y-2">
        {cells.slice(0, 8).map((item) => (
          <div key={`${item.employee}-${item.date}-${item.messages.join(",")}`} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <p className="font-medium">{item.employee} / {item.date}</p>
            {item.messages.map((message) => <p key={message}>{message}</p>)}
          </div>
        ))}
      </div>
    </WidgetCard>
  );
};
