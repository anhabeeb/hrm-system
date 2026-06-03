/**
 * Prompt 20 frontend TODO checks.
 *
 * These placeholders document the high-value regression checks for the
 * Attendance, Kiosk Devices, Sync Status, and Biometric UI modules until the
 * project enables a browser test runner.
 */
export const prompt20FrontendTodoChecks = [
  "AttendancePage uses attendance.view route guard and renders Daily Summary, Events, Corrections, and Conflicts tabs.",
  "Attendance summary reads rows from response.data and pagination from top-level response.pagination.",
  "Attendance summary endpoint returns standard paginated shape and does not use nested data.rows.",
  "Daily summary filters update URL query params, reset page to 1, and call /attendance/summary with backend pagination.",
  "Attendance Events tab calls /attendance/events for raw events and does not call /attendance for raw events.",
  "Attendance Events tab shows a permission-aware message when event access returns 403.",
  "Manual attendance and correction actions are hidden without the seeded permissions and require a reason in shadcn dialogs.",
  "Locked payroll errors map to the friendly attendance payroll-lock message in manual entry, corrections, conflicts, sync, and biometric reprocess flows.",
  "Events, sync conflict detail, biometric logs, and device detail drawers sanitize token/hash/file/R2/template payload fields before rendering.",
  "KioskDevicesPage renders a table and never renders device_token_hash, api_token_hash, raw device tokens from list/detail data, or stores tokens in localStorage/sessionStorage.",
  "Kiosk Devices navigation and route guards use offline_sync because the page calls backend /devices APIs.",
  "Kiosk Devices frontend no longer uses kiosk_attendance for /kiosk-devices; future dedicated /kiosk can use kiosk_attendance.",
  "Device token is displayed only from registration or rotate-token success response and only in temporary component state.",
  "SyncStatusPage renders Batches, Items, Conflicts, and Device State tabs; Items stays a safe placeholder because the admin sync-items endpoint is not implemented.",
  "Sync reports/device health 403 states are permission-aware and do not block the primary tables.",
  "BiometricPage uses biometric_attendance feature guard and does not render token hashes, vendor secrets, biometric templates, or biometric images.",
  "Biometric mapping dialog validates employee ID, and reprocess/map actions are hidden without biometric.resolve_unmatched/biometric.sync permissions.",
  "No dark mode toggle or theme switching is introduced in these modules.",
] as const;
