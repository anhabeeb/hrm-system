import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { sanitizeForDisplay } from "@/lib/safe-display";
import { attendanceIssueText, formatDate, formatDateTime } from "./attendance-format";
import { AttendanceEventTimeline } from "./AttendanceEventTimeline";
import type { AttendanceEvent, AttendanceSummary } from "./attendance.types";

const parseWarnings = (value?: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [value];
  }
};

export const AttendanceDetailDrawer = ({
  summary,
  events,
  open,
  onOpenChange,
}: {
  summary: AttendanceSummary | null;
  events: AttendanceEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title="Attendance detail" subtitle={summary?.employee_name ?? summary?.employee_id ?? "Daily attendance record"}>
    {summary ? (
      <>
        <DetailSection
          title="Employee"
          rows={[
            { label: "Employee", value: summary.employee_name ?? summary.full_name ?? summary.employee_id ?? "Unknown employee" },
            { label: "Employee code", value: summary.employee_code ?? "Not recorded" },
            { label: "Outlet", value: summary.outlet_name ?? summary.outlet_id ?? "Not recorded" },
          ]}
        />
        <DetailSection
          title="Attendance Summary"
          rows={[
            { label: "Date", value: formatDate(summary.attendance_date ?? summary.date) },
            { label: "Status", value: <StatusBadge status={summary.status} /> },
            { label: "Classification", value: <StatusBadge status={summary.classification ?? summary.status} /> },
            { label: "Expected shift", value: summary.expected_start && summary.expected_end ? `${formatDateTime(summary.expected_start)} - ${formatDateTime(summary.expected_end)}` : "Not rostered" },
            { label: "Clock in", value: formatDateTime(summary.first_clock_in ?? summary.clock_in_time) },
            { label: "Clock out", value: formatDateTime(summary.last_clock_out ?? summary.clock_out_time) },
            { label: "Worked minutes", value: summary.worked_minutes ?? 0 },
            { label: "Late minutes", value: summary.late_minutes ?? 0 },
            { label: "Early out minutes", value: summary.early_out_minutes ?? 0 },
            { label: "Overtime minutes", value: summary.overtime_minutes ?? 0 },
            { label: "Absence minutes", value: summary.absence_minutes ?? 0 },
          ]}
        />
        <AttendanceEventTimeline events={events} />
        <DetailSection
          title="Rule Warnings"
          rows={[
            {
              label: "Warnings",
              value: parseWarnings(summary.warnings_json).length
                ? parseWarnings(summary.warnings_json).join(" ")
                : "No rule warnings recorded.",
            },
            { label: "Detected issues", value: attendanceIssueText(summary.issues, summary.issue_type) },
          ]}
        />
        <DetailSection title="Audit / Sync Source" rows={[{ label: "Safe payload", value: <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(summary), null, 2)}</pre> }]} />
      </>
    ) : null}
  </DetailDrawer>
);
