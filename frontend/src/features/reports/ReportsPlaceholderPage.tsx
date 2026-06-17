import { ModulePlaceholderPage } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "rep-1", report_name: "Attendance Summary", category: "Attendance", sensitive: "No", export: "Excel/PDF" },
  { id: "rep-2", report_name: "Payroll Register", category: "Payroll", sensitive: "Yes", export: "Excel/PDF with permission" },
];

export const ReportsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Reports"
    description="Reports, export jobs, and backup workflows will keep sensitive data scoped."
    tableTitle="Report catalogue"
    tableDescription="Reports use filters, saved views, and Excel/PDF export actions."
    rows={rows}
    columns={[
      { key: "report_name", header: "Report Name" },
      { key: "category", header: "Category" },
      { key: "sensitive", header: "Sensitive" },
      { key: "export", header: "Export" },
    ]}
  />
);
