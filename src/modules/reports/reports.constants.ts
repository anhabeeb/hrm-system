export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const REPORT_MESSAGES = {
  catalog: "Report catalog loaded successfully.",
  list: "Reports loaded successfully.",
  generated: "Report generated successfully.",
  dashboard: "Dashboard summary loaded successfully.",
  employee: "Employee summary loaded successfully.",
  attendance: "Attendance summary loaded successfully.",
  leave: "Leave summary loaded successfully.",
  payroll: "Payroll summary loaded successfully.",
  assets: "Asset summary loaded successfully.",
  documents: "Document summary loaded successfully.",
  expiringDocuments: "Expiring document report loaded successfully.",
  missingDocuments: "Missing document report loaded successfully.",
  audit: "Audit activity report loaded successfully.",
  deviceHealth: "Device health report loaded successfully.",
  syncStatus: "Sync status report loaded successfully.",
} as const;

export const REPORT_DEFINITIONS = [
  { report_key: "employee_summary", report_name: "Employee Summary", category: "employees", description: "Employee counts by status, outlet, department, and position.", required_permission: "employees.view", supported_filters: ["outlet_id", "department_id", "position_id", "employee_type", "employment_status", "nationality", "joined_from", "joined_to"], supports_export: true, sensitive: false },
  { report_key: "attendance_summary", report_name: "Attendance Summary", category: "attendance", description: "Attendance totals from daily summaries.", required_permission: "attendance.view", supported_filters: ["date_from", "date_to", "outlet_id", "employee_id", "department_id", "status"], supports_export: true, sensitive: false },
  { report_key: "leave_summary", report_name: "Leave Summary", category: "leave", description: "Leave request totals and days.", required_permission: "leave.view", supported_filters: ["date_from", "date_to", "outlet_id", "employee_id", "leave_type_id", "status"], supports_export: true, sensitive: false },
  { report_key: "payroll_summary", report_name: "Payroll Summary", category: "payroll", description: "Payroll run and item totals scoped by access.", required_permission: "payroll.view", supported_filters: ["payroll_month", "outlet_id", "status"], supports_export: true, sensitive: true },
  { report_key: "asset_summary", report_name: "Asset Summary", category: "assets", description: "Asset inventory and assignment status.", required_permission: "assets.view", supported_filters: ["outlet_id", "status"], supports_export: true, sensitive: false },
  { report_key: "document_summary", report_name: "Document Summary", category: "documents", description: "Document compliance totals without R2 keys.", required_permission: "documents.view", supported_filters: ["outlet_id", "status"], supports_export: true, sensitive: true },
  { report_key: "expiring_documents", report_name: "Expiring Documents", category: "compliance", description: "Documents expiring soon.", required_permission: "documents.view", supported_filters: ["outlet_id", "days"], supports_export: true, sensitive: true },
  { report_key: "missing_documents", report_name: "Missing Documents", category: "compliance", description: "Employees missing required documents.", required_permission: "documents.view", supported_filters: ["outlet_id"], supports_export: true, sensitive: true },
  { report_key: "audit_activity", report_name: "Audit Activity", category: "audit", description: "Audit trail with sensitive values masked.", required_permission: "audit_logs.view", supported_filters: ["date_from", "date_to", "module", "action"], supports_export: true, sensitive: true },
  { report_key: "device_health", report_name: "Device Health", category: "devices", description: "Device health and recent status.", required_permission: "devices.view_health", supported_filters: ["outlet_id", "device_id"], supports_export: true, sensitive: false },
  { report_key: "sync_status", report_name: "Sync Status", category: "sync", description: "Sync batch/item/conflict status.", required_permission: "sync.view", supported_filters: ["outlet_id", "device_id"], supports_export: true, sensitive: false },
] as const;
