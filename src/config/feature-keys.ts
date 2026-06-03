export const FEATURE_KEYS = {
  attendanceTracking: "attendance_tracking",
  auditLogs: "audit_logs",
  documents: "documents",
  employeeDirectory: "employee_directory",
  notifications: "notifications",
  payrollWorkspace: "payroll_workspace",
  realtimeUpdates: "realtime_updates",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];
