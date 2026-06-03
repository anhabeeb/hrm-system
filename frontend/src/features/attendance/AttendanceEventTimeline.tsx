import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize } from "./attendance-format";
import type { AttendanceEvent } from "./attendance.types";

export const AttendanceEventTimeline = ({ events }: { events: AttendanceEvent[] }) => (
  <div className="rounded-lg border bg-card">
    <div className="border-b px-4 py-3">
      <h3 className="text-sm font-semibold">Punches / Event Timeline</h3>
    </div>
    <div className="divide-y">
      {events.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No punch events returned for this record.</p>
      ) : (
        events.map((event) => (
          <div key={event.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{humanize(event.event_type)}</p>
              <p className="text-muted-foreground">{formatDateTime(event.event_time)}</p>
            </div>
            <StatusBadge status={event.sync_status ?? event.approval_status ?? "neutral"} />
          </div>
        ))
      )}
    </div>
  </div>
);
