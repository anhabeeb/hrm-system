import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "job-1", job: "Employee export", type: "employees", format: "CSV", status: "completed", created_by: "Admin" },
  { id: "job-2", job: "Attendance import", type: "attendance_manual", format: "XLSX", status: "pending", created_by: "HR" },
];

export const ImportExportPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Import / Export"
    description="Import validation, export jobs, downloads, retry, and cancel flows will be implemented later."
    tableTitle="Import and export jobs"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "job", header: "Job" },
      { key: "type", header: "Type" },
      { key: "format", header: "Format" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "created_by", header: "Created By" },
    ]}
  />
);
