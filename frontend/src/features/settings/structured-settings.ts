import type { SettingsGroup } from "./settings.types";

export type FieldType = "text" | "email" | "url" | "number" | "switch" | "select" | "textarea";

export interface SettingsFieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface SettingsSectionDefinition {
  title: string;
  description?: string;
  settingKey: string;
  fields: SettingsFieldDefinition[];
}

export interface SettingsPageDefinition {
  title: string;
  description: string;
  group: SettingsGroup;
  endpointPath: string;
  managePermission: string;
  sections: SettingsSectionDefinition[];
}

export const settingsPageDefinitions: Record<string, SettingsPageDefinition> = {
  security: {
    title: "Security",
    description: "Password, two-factor, session, login protection, and reset policy controls.",
    group: "audit_security",
    endpointPath: "security",
    managePermission: "security.manage",
    sections: [
      {
        title: "Password Policy",
        settingKey: "security.default_rules",
        fields: [
          { key: "password_min_length", label: "Minimum length", type: "number" },
          { key: "require_uppercase", label: "Require uppercase", type: "switch" },
          { key: "require_lowercase", label: "Require lowercase", type: "switch" },
          { key: "require_number", label: "Require number", type: "switch" },
          { key: "require_symbol", label: "Require symbol", type: "switch" },
          { key: "password_expiry_days", label: "Password expiry days", type: "number" },
          { key: "prevent_reuse_count", label: "Prevent reuse count", type: "number" },
        ],
      },
      {
        title: "Two-Factor Policy",
        settingKey: "security.default_rules",
        fields: [
          { key: "totp_google_authenticator_enabled", label: "Allow users to enable 2FA", type: "switch" },
          { key: "require_2fa_for_super_admin", label: "Require 2FA for Super Admins", type: "switch" },
          { key: "require_2fa_for_admins", label: "Require 2FA for Admin/HR/Payroll roles", type: "switch" },
          { key: "backup_codes_enabled", label: "Backup codes enabled", type: "switch" },
        ],
      },
      {
        title: "Session and Login Protection",
        settingKey: "security.default_rules",
        fields: [
          { key: "session_timeout_minutes", label: "Session timeout minutes", type: "number" },
          { key: "idle_timeout_minutes", label: "Idle timeout minutes", type: "number" },
          { key: "concurrent_session_policy", label: "Concurrent session policy", type: "select", options: [
            { label: "Block new login", value: "block_new_login" },
            { label: "Revoke old session", value: "revoke_old_session" },
          ] },
          { key: "allow_admin_session_override", label: "Allow admin session override", type: "switch" },
          { key: "session_device_tracking_enabled", label: "Session device tracking enabled", type: "switch" },
          { key: "remember_me_allowed", label: "Remember-me allowed", type: "switch" },
          { key: "remember_me_session_days", label: "Remember-me session days", type: "number" },
          { key: "failed_login_limit", label: "Max failed attempts", type: "number" },
          { key: "lock_minutes", label: "Lockout duration minutes", type: "number" },
          { key: "reset_token_expiry_minutes", label: "Reset token expiry minutes", type: "number" },
        ],
      },
    ],
  },
  attendance: {
    title: "Attendance Management",
    description: "Track employee attendance, lateness, absences, corrections, biometric/kiosk entries, and attendance-based payroll review.",
    group: "attendance",
    endpointPath: "attendance",
    managePermission: "attendance.settings.manage",
    sections: [
      {
        title: "Attendance Sub-Features",
        description: "Enable only the attendance workflows your company is actively using. These controls are ignored while Attendance Management is disabled.",
        settingKey: "attendance.default_rules",
        fields: [
          { key: "attendance.manual_entry_enabled", label: "Manual Attendance", type: "switch", help: "Allow authorized users to enter or adjust attendance manually." },
          { key: "attendance.kiosk_enabled", label: "Kiosk Attendance", type: "switch", help: "Allow kiosk check-in/check-out flows and kiosk device setup." },
          { key: "attendance.biometric_enabled", label: "Biometric Attendance", type: "switch", help: "Allow biometric device setup, sync, and imported punch processing." },
          { key: "attendance.corrections_enabled", label: "Attendance Corrections", type: "switch", help: "Allow employees/managers to request, approve, or reject attendance corrections." },
          { key: "attendance.payroll_deductions_enabled", label: "Payroll Deductions from Attendance", type: "switch", help: "Allow new absent, late, and missing-punch deductions to flow into payroll review." },
        ],
      },
      {
        title: "Time Rules",
        settingKey: "attendance.default_rules",
        fields: [
          { key: "grace_period_minutes", label: "Grace period minutes", type: "number" },
          { key: "late_threshold_minutes", label: "Late threshold minutes", type: "number" },
          { key: "early_checkout_threshold_minutes", label: "Early checkout threshold minutes", type: "number" },
          { key: "default_shift_start_time", label: "Default shift start time", type: "text" },
          { key: "default_shift_end_time", label: "Default shift end time", type: "text" },
          { key: "default_break_minutes", label: "Default break minutes", type: "number" },
        ],
      },
      {
        title: "Manual Attendance and Correction Rules",
        description: "Workflow enablement is controlled in Attendance Sub-Features above; these fields only tune the enabled workflows.",
        settingKey: "attendance.default_rules",
        fields: [
          { key: "correction_approval_required", label: "Correction approval required", type: "switch" },
          { key: "correction_deadline_days", label: "Correction deadline days", type: "number" },
          { key: "require_outlet_for_manual_attendance", label: "Require outlet for manual attendance", type: "switch" },
          { key: "manual_attendance_requires_reason", label: "Require reason for manual attendance", type: "switch" },
        ],
      },
      {
        title: "Devices and Payroll Lock",
        settingKey: "attendance.default_rules",
        fields: [
          { key: "payroll_lock_prevents_attendance_edits", label: "Payroll lock prevents attendance edits", type: "switch" },
          { key: "allow_overtime", label: "Overtime enabled", type: "switch" },
          { key: "overtime_requires_approval", label: "Overtime approval required", type: "switch" },
          { key: "overtime_rounding_minutes", label: "Overtime rounding minutes", type: "number" },
          { key: "minimum_overtime_minutes", label: "Minimum overtime minutes", type: "number" },
        ],
      },
      {
        title: "Attendance Classification Rules",
        settingKey: "attendance.default_rules",
        fields: [
          { key: "missed_punch_policy", label: "Missed punch policy", type: "select", options: [{ label: "Incomplete", value: "incomplete" }, { label: "Absent", value: "absent" }, { label: "Warning only", value: "warning" }] },
          { key: "absent_if_no_check_in", label: "Absent if no check-in", type: "switch" },
          { key: "absent_if_no_check_out", label: "Absent if no check-out", type: "switch" },
          { key: "require_roster_for_attendance", label: "Require roster for attendance", type: "switch" },
          { key: "use_default_shift_when_no_roster", label: "Use default shift when no roster exists", type: "switch" },
          { key: "require_complete_attendance_before_payroll", label: "Require complete attendance before payroll", type: "switch" },
          { key: "missing_attendance_counts_as_absent", label: "Missing attendance counts as absent", type: "switch" },
        ],
      },
      {
        title: "Duty Rosters and Shift Scheduling",
        settingKey: "attendance.roster_rules",
        fields: [
          { key: "roster_module_enabled", label: "Roster module enabled", type: "switch" },
          { key: "allow_roster_overlap_override", label: "Allow overlapping shift override", type: "switch" },
          { key: "allow_scheduling_on_leave", label: "Allow scheduling employees on approved leave", type: "switch" },
          { key: "allow_scheduling_on_holidays", label: "Allow scheduling on roster holidays", type: "switch" },
          { key: "allow_scheduling_suspended_employee", label: "Allow scheduling suspended employees", type: "switch" },
          { key: "require_publish_before_attendance", label: "Require published roster before attendance", type: "switch" },
          { key: "roster_publish_required", label: "Require roster publish workflow", type: "switch" },
          { key: "default_shift_break_minutes", label: "Default shift break minutes", type: "number" },
          { key: "roster_conflict_warning_days", label: "Conflict look-ahead days", type: "number" },
        ],
      },
    ],
  },
  leave: {
    title: "Leave",
    description: "General leave policy, leave type behavior, statutory templates, and long leave settings.",
    group: "leave",
    endpointPath: "leave",
    managePermission: "leave.settings.manage",
    sections: [
      {
        title: "General Leave Policy",
        settingKey: "leave.default_rules",
        fields: [
          { key: "leave_module_enabled", label: "Leave module enabled", type: "switch" },
          { key: "approval_required", label: "Approval required", type: "switch" },
          { key: "allow_half_day_leave", label: "Allow half-day leave", type: "switch" },
          { key: "allow_backdated_leave_request", label: "Allow backdated leave request", type: "switch" },
          { key: "backdated_limit_days", label: "Backdated limit days", type: "number" },
          { key: "sick_leave_attachment_required", label: "Require attachment for sick leave", type: "switch" },
        ],
      },
      {
        title: "Leave Types Summary",
        description: "Leave type names and balances are managed from the Leave module; this settings page controls defaults.",
        settingKey: "leave.default_rules",
        fields: [
          { key: "default_annual_entitlement_days", label: "Default annual entitlement", type: "number" },
          { key: "carry_forward_allowed", label: "Carry forward allowed", type: "switch" },
          { key: "max_carry_forward_days", label: "Max carry forward days", type: "number" },
          { key: "leave_type_documents_required", label: "Documents may be required by type", type: "switch" },
        ],
      },
      {
        title: "Foreign Employee Long Leave",
        settingKey: "long_leave.default_rules",
        fields: [
          { key: "long_leave_enabled", label: "Long leave enabled", type: "switch" },
          { key: "salary_rule", label: "Long leave salary deduction rule", type: "select", options: [{ label: "Pay only days worked", value: "pay_only_worked_days" }] },
          { key: "pay_only_worked_days", label: "Pay only days worked during long leave month", type: "switch" },
          { key: "max_duration_days", label: "Max duration days", type: "number" },
        ],
      },
    ],
  },
  payroll: {
    title: "Payroll",
    description: "Payroll cycle, salary calculation, advances, loans, approval, locking, and payslip controls.",
    group: "payroll",
    endpointPath: "payroll",
    managePermission: "payroll.settings.manage",
    sections: [
      {
        title: "Payroll Cycle",
        settingKey: "payroll.default_rules",
        fields: [
          { key: "monthly_payroll_enabled", label: "Monthly payroll enabled", type: "switch" },
          { key: "default_payroll_day", label: "Default payroll day", type: "number" },
          { key: "payroll_period_rule", label: "Payroll period rule", type: "select", options: [{ label: "Calendar month", value: "calendar_month" }, { label: "Custom cycle", value: "custom_cycle" }] },
          { key: "currency", label: "Default currency", type: "text" },
        ],
      },
      {
        title: "Salary Calculation",
        settingKey: "payroll.default_rules",
        fields: [
          { key: "salary_source", label: "Salary source", type: "text", help: "Payroll continues to use employee_salary_history." },
          { key: "salary_calculation_basis", label: "Daily rate calculation method", type: "select", options: [{ label: "Calendar days", value: "calendar_days" }, { label: "Fixed 30 days", value: "fixed_30_days" }, { label: "Working days", value: "working_days" }, { label: "Custom days", value: "custom_days" }] },
          { key: "unpaid_leave_deduction_enabled", label: "Unpaid leave deduction rule", type: "switch" },
          { key: "long_leave_deduction_rule", label: "Long leave deduction rule", type: "text" },
          { key: "rounding_rule", label: "Rounding rule", type: "select", options: [{ label: "Round nearest", value: "nearest" }, { label: "Round down", value: "down" }, { label: "Round up", value: "up" }] },
        ],
      },
      {
        title: "Advances, Loans, Approval, and Payslips",
        settingKey: "payroll.default_rules",
        fields: [
          { key: "advance_payments_enabled", label: "Advance payments enabled", type: "switch" },
          { key: "salary_loans_enabled", label: "Salary loans enabled", type: "switch" },
          { key: "max_advance_percentage", label: "Max advance percentage", type: "number" },
          { key: "deduct_advances_automatically", label: "Deduct advances automatically", type: "switch" },
          { key: "approval_required", label: "Approval required", type: "switch" },
          { key: "payroll_lock_enabled", label: "Lock attendance after finalization", type: "switch" },
          { key: "allow_payroll_reopen", label: "Allow payroll reopen", type: "switch" },
          { key: "payslip_generation_enabled", label: "Payslip generation enabled", type: "switch" },
          { key: "show_deductions_breakdown", label: "Show deductions breakdown", type: "switch" },
        ],
      },
      {
        title: "Salary and Promotion Approval",
        description: "Controls approval behavior for salary changes and promotions that include salary changes.",
        settingKey: "approvals.salary_rules",
        fields: [
          { key: "salary_change_approval_enabled", label: "Salary change approval required", type: "switch" },
          { key: "promotion_salary_change_approval_enabled", label: "Promotion salary approval required", type: "switch" },
          { key: "salary_correction_approval_enabled", label: "Salary correction approval required", type: "switch" },
          { key: "allow_requester_self_approval", label: "Allow requester self-approval", type: "switch" },
          { key: "allow_super_admin_override", label: "Allow Super Admin override", type: "switch" },
          { key: "auto_apply_when_no_eligible_approver", label: "Auto-apply when no eligible approver", type: "switch" },
          { key: "approval_request_expiry_days", label: "Approval expiry days", type: "number" },
          { key: "approval_applying_recovery_minutes", label: "Applying recovery window minutes", type: "number" },
          { key: "require_reason_for_approval", label: "Require reason for approval", type: "switch" },
          { key: "require_reason_for_rejection", label: "Require reason for rejection", type: "switch" },
          { key: "compensation_component_approval_enabled", label: "Compensation component approval required", type: "switch" },
          { key: "compensation_allowance_approval_enabled", label: "Allowance approval required", type: "switch" },
          { key: "compensation_benefit_approval_enabled", label: "Benefit approval required", type: "switch" },
          { key: "compensation_deduction_approval_enabled", label: "Deduction approval required", type: "switch" },
        ],
      },
    ],
  },
};

export const additionalSettingsPageDefinitions: Record<string, SettingsPageDefinition> = {
  documents: {
    title: "Documents",
    description: "Document upload, sensitive access, expiry warning, category, and foreign employee document controls.",
    group: "documents",
    endpointPath: "documents",
    managePermission: "documents.settings.manage",
    sections: [
      {
        title: "General Document Settings",
        settingKey: "documents.default_rules",
        fields: [
          { key: "document_module_enabled", label: "Document module enabled", type: "switch" },
          { key: "max_file_size_mb", label: "Max file size MB", type: "number" },
          { key: "allowed_file_types", label: "Allowed file types", type: "text" },
          { key: "sensitive_documents_enabled", label: "Sensitive documents enabled", type: "switch" },
          { key: "access_logging_enabled", label: "Access logging enabled", type: "switch" },
        ],
      },
      {
        title: "Expiry Warnings and Categories",
        settingKey: "documents.default_rules",
        fields: [
          { key: "default_warning_days", label: "Default warning days", type: "number" },
          { key: "warning_30_days_enabled", label: "30 day warning", type: "switch" },
          { key: "warning_60_days_enabled", label: "60 day warning", type: "switch" },
          { key: "warning_90_days_enabled", label: "90 day warning", type: "switch" },
          { key: "dashboard_warnings_enabled", label: "Show dashboard warnings", type: "switch" },
          { key: "notify_hr_admins", label: "Notify HR/admins when available", type: "switch" },
        ],
      },
      {
        title: "Employee Contract Tracking",
        settingKey: "documents.contract_rules",
        fields: [
          { key: "contract_tracking_enabled", label: "Contract tracking enabled", type: "switch" },
          { key: "contract_expiry_warning_days", label: "Contract expiry warning days", type: "number" },
          { key: "contract_document_required", label: "Contract document required", type: "switch" },
          { key: "require_contract_for_foreign_employees", label: "Require contracts for foreign employees", type: "switch" },
          { key: "require_contract_for_all_employees", label: "Require contracts for all employees", type: "switch" },
          { key: "allow_multiple_active_contracts", label: "Allow multiple active contracts", type: "switch" },
          { key: "contract_renewal_approval_enabled", label: "Contract renewal approval enabled", type: "switch" },
        ],
      },
      {
        title: "Foreign Employee Expected Documents",
        description: "These remain warnings, not mandatory blockers.",
        settingKey: "documents.foreign_employee_expected",
        fields: [
          { key: "passport", label: "Passport", type: "switch" },
          { key: "work_visa", label: "Work visa", type: "switch" },
          { key: "work_permit", label: "Work permit", type: "switch" },
          { key: "medical_certificate", label: "Medical certificate", type: "switch" },
          { key: "insurance", label: "Insurance", type: "switch" },
          { key: "driving_license", label: "Driving license", type: "switch" },
        ],
      },
    ],
  },
  backup: {
    title: "Backup & Recovery",
    description: "Backup schedule, retention, manual backup, restore approval, and health controls.",
    group: "backup_recovery",
    endpointPath: "backup",
    managePermission: "backup.settings.manage",
    sections: [
      { title: "Backup Controls", settingKey: "backup.default_rules", fields: [
        { key: "backup_enabled", label: "Backup enabled", type: "switch" },
        { key: "backup_frequency", label: "Backup frequency", type: "select", options: [{ label: "Daily", value: "daily" }, { label: "Weekly", value: "weekly" }, { label: "Manual", value: "manual" }] },
        { key: "retention_days", label: "Retention days", type: "number" },
        { key: "manual_backup_allowed", label: "Manual backup allowed", type: "switch" },
        { key: "restore_requires_approval", label: "Restore requires approval", type: "switch" },
        { key: "backup_health_status", label: "Backup health/status", type: "text" },
      ] },
    ],
  },
  notifications: {
    title: "Notifications",
    description: "System notification controls. Email settings are shown as planned unless a mail service is configured.",
    group: "notifications",
    endpointPath: "notifications",
    managePermission: "notifications.settings.manage",
    sections: [
      { title: "Notification Channels and Events", settingKey: "notifications.default_rules", fields: [
        { key: "email_notifications_enabled", label: "Email notifications enabled (planned if mail service is absent)", type: "switch" },
        { key: "system_notifications_enabled", label: "System notifications enabled", type: "switch" },
        { key: "leave_approval_notifications", label: "Leave approval notifications", type: "switch" },
        { key: "attendance_correction_notifications", label: "Attendance correction notifications", type: "switch" },
        { key: "payroll_notifications", label: "Payroll approval/finalization notifications", type: "switch" },
        { key: "document_expiry_notifications", label: "Document expiry notifications", type: "switch" },
        { key: "security_notifications", label: "2FA/security notifications", type: "switch" },
        { key: "profile_update_notifications", label: "Profile update approval notifications", type: "switch" },
        { key: "document_expiry_lead_days", label: "Document expiry lead time days", type: "number" },
        { key: "admin_recipient_roles", label: "Admin recipient roles/groups", type: "text" },
      ] },
    ],
  },
  reports: {
    title: "Reports",
    description: "Export format, default ranges, masking, and sensitive report visibility controls.",
    group: "reports",
    endpointPath: "reports",
    managePermission: "reports.settings.manage",
    sections: [
      { title: "Report Controls", settingKey: "reports.default_rules", fields: [
        { key: "report_exports_enabled", label: "Report exports enabled", type: "switch" },
        { key: "allowed_export_formats", label: "Allowed export formats", type: "text" },
        { key: "default_date_range", label: "Default date range", type: "select", options: [{ label: "Current month", value: "current_month" }, { label: "Last 30 days", value: "last_30_days" }, { label: "Custom", value: "custom" }] },
        { key: "sensitive_field_masking", label: "Sensitive field masking", type: "switch" },
        { key: "salary_visibility_in_reports", label: "Salary visibility in reports", type: "switch" },
        { key: "audit_log_report_access", label: "Audit log report access", type: "switch" },
        { key: "employee_document_report_access", label: "Employee document report access", type: "switch" },
        { key: "payroll_report_access", label: "Payroll report access", type: "switch" },
        { key: "attendance_report_access", label: "Attendance report access", type: "switch" },
      ] },
    ],
  },
  importExport: {
    title: "Import / Export",
    description: "Import and export safety controls, duplicate behavior, row limits, and sensitive export gates.",
    group: "import_export",
    endpointPath: "import-export",
    managePermission: "import_export.settings.manage",
    sections: [
      { title: "Import / Export Controls", settingKey: "import_export.default_rules", fields: [
        { key: "import_enabled", label: "Import enabled", type: "switch" },
        { key: "export_enabled", label: "Export enabled", type: "switch" },
        { key: "allowed_import_types", label: "Allowed import types", type: "text" },
        { key: "require_approval_before_import_apply", label: "Require approval before import apply", type: "switch" },
        { key: "max_rows_per_import", label: "Max rows per import", type: "number" },
        { key: "duplicate_handling_strategy", label: "Duplicate handling strategy", type: "select", options: [{ label: "Skip", value: "skip" }, { label: "Update existing", value: "update" }, { label: "Fail file", value: "fail" }] },
        { key: "import_error_report_retention_days", label: "Error report retention days", type: "number" },
        { key: "export_sensitive_data_allowed", label: "Sensitive export allowed with permission", type: "switch" },
      ] },
    ],
  },
  devicesSync: {
    title: "Devices & Sync",
    description: "Kiosk, biometric, local bridge, offline sync, batch, retry, and realtime notification controls.",
    group: "offline_sync",
    endpointPath: "devices-sync",
    managePermission: "devices.settings.manage",
    sections: [
      { title: "Devices", settingKey: "devices.default_rules", fields: [
        { key: "device_registration_enabled", label: "Device registration enabled", type: "switch" },
        { key: "device_approval_required", label: "Device approval required", type: "switch" },
        { key: "device_trust_expiry_days", label: "Device trust expiry days", type: "number" },
        { key: "allow_kiosk_devices", label: "Allow kiosk devices", type: "switch" },
        { key: "allow_biometric_devices", label: "Allow biometric devices", type: "switch" },
      ] },
      { title: "Biometric", settingKey: "biometric.default_rules", fields: [
        { key: "biometric_sync_enabled", label: "Biometric sync enabled", type: "switch" },
        { key: "device_push_api_enabled", label: "Device push API enabled", type: "switch" },
        { key: "local_bridge_enabled", label: "Local bridge enabled", type: "switch" },
        { key: "biometric_correction_approval_required", label: "Biometric correction approval required", type: "switch" },
      ] },
      { title: "Sync and Realtime", settingKey: "sync.default_rules", fields: [
        { key: "realtime_events_enabled", label: "Realtime events enabled", type: "switch" },
        { key: "offline_sync_enabled", label: "Offline sync enabled", type: "switch" },
        { key: "max_records_per_batch", label: "Sync batch size", type: "number" },
        { key: "retry_attempts", label: "Retry attempts", type: "number" },
        { key: "device_sync_scope_by_outlet", label: "Device sync scope by outlet", type: "switch" },
      ] },
    ],
  },
};
