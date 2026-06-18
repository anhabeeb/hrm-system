export const nonDestructiveModuleWarning = "Disabling this module hides it from normal use but does not delete existing records.";

export const mainFeatureOrder = [
  "documents",
  "asset_tracking",
  "uniform_tracking",
  "leave_management",
  "long_leave_management",
  "roster",
  "contract_tracking",
  "attendance",
  "payroll",
] as const;

export type MainFeatureKey = (typeof mainFeatureOrder)[number];

export const featureDisplay: Record<string, { name: string; description: string; dependencies?: string[]; warning: string }> = {
  documents: {
    name: "Document Tracking",
    description: "Track employee documents, KYC records, expiries, and verification status.",
    dependencies: ["employee_management"],
    warning: nonDestructiveModuleWarning,
  },
  asset_tracking: {
    name: "Asset Tracking",
    description: "Track company assets assigned to employees, including issue, return, and history.",
    dependencies: ["employee_management"],
    warning: nonDestructiveModuleWarning,
  },
  uniform_tracking: {
    name: "Uniform Tracking",
    description: "Track uniforms issued to employees, including sizes, quantities, issue dates, and return status.",
    dependencies: ["employee_management"],
    warning: nonDestructiveModuleWarning,
  },
  leave_management: {
    name: "Leave Management",
    description: "Manage employee leave requests, balances, approvals, and leave history.",
    dependencies: ["employee_management"],
    warning: nonDestructiveModuleWarning,
  },
  long_leave_management: {
    name: "Long Leave Management",
    description: "Manage extended leave workflows, foreign employee long leave, salary deduction handling, and long leave history.",
    dependencies: ["leave_management"],
    warning: nonDestructiveModuleWarning,
  },
  roster: {
    name: "Duty Roster",
    description: "Plan employee work schedules, weekly duty rosters, shift assignments, and roster change workflows.",
    dependencies: ["employee_management"],
    warning: nonDestructiveModuleWarning,
  },
  contract_tracking: {
    name: "Contract Tracking",
    description: "Track employee contracts, renewals, probation periods, linked contract documents, and contract expiry alerts.",
    dependencies: ["employee_management"],
    warning: nonDestructiveModuleWarning,
  },
  attendance: {
    name: "Attendance Management",
    description: "Track employee attendance, lateness, absences, corrections, biometric/kiosk entries, and attendance-based payroll review.",
    dependencies: ["employee_management"],
    warning: nonDestructiveModuleWarning,
  },
  payroll: {
    name: "Payroll Management",
    description: "Process employee salaries, advances, loans, overtime, benefits, deductions, payslips, and payroll approvals.",
    dependencies: ["employee_management"],
    warning: nonDestructiveModuleWarning,
  },
  reports: {
    name: "Reports",
    description: "Generate HR and payroll reports using enabled modules and scoped permissions.",
    warning: nonDestructiveModuleWarning,
  },
  import_export: {
    name: "Import / Export",
    description: "Manage supported Excel imports and Excel/PDF exports for configured HR data.",
    warning: nonDestructiveModuleWarning,
  },
  backup_recovery: {
    name: "Backup & Recovery",
    description: "Create backups, verify backup integrity, manage retention, and control restore safety.",
    warning: nonDestructiveModuleWarning,
  },
  offline_sync: {
    name: "Devices & Sync",
    description: "Manage offline sync, kiosk/device sync, and device-related operational settings.",
    warning: nonDestructiveModuleWarning,
  },
  notifications: {
    name: "Notifications & Alerts",
    description: "Configure system notifications, expiry reminders, and alert delivery behavior.",
    warning: nonDestructiveModuleWarning,
  },
  employee_management: {
    name: "Employee Management",
    description: "Core employee records, organization structure, and employee lifecycle data.",
    warning: nonDestructiveModuleWarning,
  },
};

export const setupTargetByFeature: Record<string, string> = {
  documents: "feature-document-tracking",
  asset_tracking: "feature-asset-tracking",
  uniform_tracking: "feature-uniform-tracking",
  leave_management: "feature-leave-management",
  long_leave_management: "feature-long-leave-management",
  roster: "feature-duty-roster",
  contract_tracking: "feature-contract-tracking",
  attendance: "feature-attendance-management",
  payroll: "feature-payroll-management",
};
