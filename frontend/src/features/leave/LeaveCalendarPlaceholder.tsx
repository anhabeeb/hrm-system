import { EmptyState } from "@/components/data/EmptyState";
import type { LeaveRequest } from "./leave.types";

export const LeaveCalendarPlaceholder = ({ rows }: { rows?: LeaveRequest[] }) => (
  <div className="rounded-lg border bg-card">
    {rows && rows.length > 0 ? (
      <div className="p-4 text-sm text-muted-foreground">Calendar endpoint is connected. A full calendar grid will be added later; current records are available in Requests.</div>
    ) : (
      <EmptyState title="Leave calendar view will be connected in a future prompt." description="Calendar data is not faked; use the Requests tab for the current table view." />
    )}
  </div>
);
