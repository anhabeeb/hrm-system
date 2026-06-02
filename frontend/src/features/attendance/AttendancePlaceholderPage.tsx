import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "att-1", employee: "Aisha Mohamed", date: "2026-06-02", first_clock_in: "08:01", last_clock_out: "17:03", status: "approved" },
  { id: "att-2", employee: "Hassan Ali", date: "2026-06-02", first_clock_in: "08:20", last_clock_out: "-", status: "pending" },
];

export const AttendancePlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Attendance"
    description="Daily attendance summaries and correction workflows will live here."
    tableTitle="Attendance summaries"
    tableDescription="Table-first attendance review foundation."
    rows={rows}
    columns={[
      { key: "employee", header: "Employee" },
      { key: "date", header: "Date" },
      { key: "first_clock_in", header: "First Clock In" },
      { key: "last_clock_out", header: "Last Clock Out" },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
