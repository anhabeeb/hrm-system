import type { SetupActivityDefinition } from "./setup-guide.types";

const core = (
  activity_key: string,
  activity_label: string,
  target_route: string,
  target_highlight_key: string,
  guide_description: string,
  completion_condition: string,
): SetupActivityDefinition => ({
  activity_key,
  module_key: null,
  activity_label,
  activity_required: true,
  target_route,
  target_page_title: activity_label,
  target_highlight_key,
  guide_title: activity_label,
  guide_description,
  recommended_choice: "Configure this before inviting the wider HR team.",
  completion_condition,
});

const moduleActivity = (
  module_key: string,
  activity_key: string,
  activity_label: string,
  target_route: string,
  target_highlight_key: string,
  guide_description: string,
  completion_condition: string,
  recommended_choice = "Enable this only if Café Asiana will actively use the workflow.",
): SetupActivityDefinition => ({
  activity_key,
  module_key,
  activity_label,
  activity_required: true,
  target_route,
  target_page_title: activity_label,
  target_highlight_key,
  guide_title: activity_label,
  guide_description,
  recommended_choice,
  completion_condition,
});

export const SETUP_GUIDE_ACTIVITIES: SetupActivityDefinition[] = [
  core("company_profile", "Confirm company profile", "/settings/company?setupGuide=company&highlight=company-profile", "company-profile", "Confirm company identity, country, timezone, and payroll currency.", "Company profile contains the required identity fields."),
  core("outlets", "Create at least one outlet/location", "/outlets?setupGuide=outlets&highlight=outlet-create-button", "outlet-create-button", "Create the locations that employees, attendance, payroll, and permissions will use.", "At least one active outlet exists."),
  core("hr_department", "Create HR Department", "/departments?setupGuide=departments&highlight=department-create-button", "department-create-button", "Create an HR department so employee ownership and approval routing have a stable home.", "An active department with HR in its name or code exists."),
  core("core_departments", "Create core departments", "/departments?setupGuide=departments&highlight=department-create-button", "department-create-button", "Create the departments that will appear on employee records, reports, and approval queues.", "At least one active department exists."),
  core("job_levels", "Create job levels", "/organization/level-role-templates?setupGuide=levels&highlight=job-levels", "job-levels", "Create job levels so permissions, approval visibility, and reporting hierarchy can be applied consistently.", "At least one active level or level role template exists."),
  core("positions", "Create positions", "/positions?setupGuide=positions&highlight=position-create-button", "position-create-button", "Create positions/titles before importing or creating employees.", "At least one active position exists."),
  core("employee_numbering", "Configure employee numbering", "/settings?setupGuide=employees&highlight=employee-numbering", "employee-numbering", "Choose a consistent employee numbering format before bulk onboarding.", "Employee numbering settings exist or have been manually confirmed."),
  core("feature_modules", "Choose enabled modules", "/settings?setupGuide=modules&highlight=feature-controls", "feature-controls", "Choose which optional modules are enabled for launch. Enabled modules add setup tasks; disabled modules are marked disabled by choice and can be enabled later by a Super Admin.", "Feature module choices have been reviewed from Feature Controls."),
  core("roles_permissions", "Review roles and permissions", "/users-access?setupGuide=permissions&highlight=roles-permissions", "roles-permissions", "Review Super Admin, Admin, HR, Payroll, and Manager access before inviting users.", "Roles and permissions have been manually reviewed."),
  core("backup_recovery", "Configure backup/recovery basic rules", "/backup-recovery?setupGuide=backup&highlight=backup-settings", "backup-settings", "Set backup retention and restore safety rules before live operations.", "Backup recovery settings exist or have been manually confirmed."),
  core("final_review", "Final review", "/setup-wizard?setupGuide=final-review&highlight=final-review", "final-review", "Review incomplete steps, disabled modules, and module dependencies before finishing setup.", "All required setup steps are complete."),

  moduleActivity("documents", "documents_types", "Choose document types", "/settings/documents?setupGuide=documents&highlight=documents-types", "documents-types", "Configure the document categories Café Asiana will track, such as passport, work permit, ID, and contracts.", "Document/KYC settings or document categories are configured."),
  moduleActivity("documents", "documents_expiry_alerts", "Configure document expiry alerts", "/settings/documents?setupGuide=documents&highlight=documents-expiry-alerts", "documents-expiry-alerts", "Set expiry warning windows so HR sees passport, work permit, and ID expiry risk early.", "Document expiry alert settings exist."),
  moduleActivity("documents", "documents_upload_permissions", "Configure upload permissions", "/settings/documents?setupGuide=documents&highlight=documents-upload-permissions", "documents-upload-permissions", "Confirm who can upload, verify, and approve employee documents.", "Document upload permissions are reviewed."),

  moduleActivity("contract_tracking", "contract_rules", "Configure contract types and rules", "/settings/documents?setupGuide=contracts&highlight=contract-rules", "contract-rules", "Configure contract expiry, probation tracking, and renewal defaults.", "Contract tracking settings exist."),
  moduleActivity("contract_tracking", "contract_renewal_approval", "Configure contract renewal approval", "/settings/documents?setupGuide=contracts&highlight=contract-renewal-approval", "contract-renewal-approval", "Choose whether contract renewal needs approval before application.", "Contract renewal approval has been reviewed."),

  moduleActivity("asset_tracking", "asset_categories", "Configure asset categories", "/assets?setupGuide=assets&highlight=asset-categories", "asset-categories", "Create asset categories for items assigned to employees.", "Asset categories exist or the step is manually confirmed."),
  moduleActivity("asset_tracking", "asset_issue_rules", "Configure asset issue/return rules", "/settings?setupGuide=assets&highlight=asset-issue-rules", "asset-issue-rules", "Review issue, return, and employee responsibility rules for company assets.", "Asset issue/return rules are reviewed."),

  moduleActivity("uniform_tracking", "uniform_types", "Configure uniform types", "/uniforms?setupGuide=uniforms&highlight=uniform-types", "uniform-types", "Create uniform types and sizes before issuing uniforms to employees.", "Uniform types exist or the step is manually confirmed."),
  moduleActivity("uniform_tracking", "uniform_issue_rules", "Configure uniform issue/return rules", "/settings?setupGuide=uniforms&highlight=uniform-issue-rules", "uniform-issue-rules", "Review how uniforms are issued, returned, and tracked.", "Uniform issue/return rules are reviewed."),

  moduleActivity("leave_management", "leave_types", "Configure leave types", "/leave?setupGuide=leave&highlight=leave-types", "leave-types", "Create the leave types and limits that employees can request.", "Leave types or leave settings exist."),
  moduleActivity("leave_management", "leave_policy_rules", "Configure leave policy rules", "/leave?setupGuide=leave&highlight=leave-policy-rules", "leave-policy-rules", "Set paid status, approval behavior, and document rules for each leave type.", "Leave policy rules are configured."),
  moduleActivity("leave_management", "leave_document_rules", "Configure leave document rules", "/settings/leave?setupGuide=leave&highlight=leave-document-rules", "leave-document-rules", "Decide when each leave type requires supporting documents.", "Leave document rules are reviewed."),
  moduleActivity("leave_management", "leave_deduction_rules", "Configure leave deduction rules", "/settings/leave?setupGuide=leave&highlight=leave-deduction-rules", "leave-deduction-rules", "Review which leave types create payroll deductions.", "Leave deduction rules are reviewed."),
  moduleActivity("leave_management", "leave_approval_workflow", "Configure leave approval workflow", "/settings/leave?setupGuide=leave&highlight=leave-approval-workflow", "leave-approval-workflow", "Choose whether leave requests require approval and who reviews them.", "Leave approval settings are configured."),

  moduleActivity("long_leave_management", "long_leave_rules", "Configure long leave rules", "/settings/leave?setupGuide=long-leave&highlight=long-leave-rules", "long-leave-rules", "Set long leave threshold, foreign employee rules, salary treatment, and return confirmation.", "Long leave settings exist."),
  moduleActivity("long_leave_management", "long_leave_deductions", "Configure long leave salary deductions", "/settings/payroll?setupGuide=long-leave&highlight=payroll-long-leave-deductions", "payroll-long-leave-deductions", "Review how long leave affects salary when Payroll Management is enabled.", "Long leave deduction settings are reviewed."),

  moduleActivity("roster", "roster_mode", "Choose roster mode and work week", "/settings/attendance?setupGuide=roster&highlight=roster-mode", "roster-mode", "Choose roster mode, default work week, and roster-attendance interaction rules.", "Roster defaults are configured."),
  moduleActivity("roster", "shift_templates", "Configure shift templates", "/rosters?setupGuide=roster&highlight=shift-templates", "shift-templates", "Create shift templates before planning weekly rosters.", "At least one shift template exists or the step is manually confirmed."),
  moduleActivity("roster", "roster_approval_workflow", "Configure roster change approvals", "/settings/attendance?setupGuide=roster&highlight=roster-approvals", "roster-approvals", "Choose how roster change requests are reviewed and published.", "Roster approval rules are reviewed."),

  moduleActivity("attendance", "attendance_mode", "Choose attendance mode", "/settings/attendance?setupGuide=attendance&highlight=attendance-subfeatures", "attendance-subfeatures", "Choose manual, kiosk, biometric, or mixed attendance modes.", "Attendance sub-features are configured."),
  moduleActivity("attendance", "attendance_time_rules", "Configure attendance time rules", "/settings/attendance?setupGuide=attendance&highlight=attendance-time-rules", "attendance-time-rules", "Set working days, grace period, late threshold, absent threshold, and fallback shift rules.", "Attendance time rules exist."),
  moduleActivity("attendance", "attendance_correction_approval", "Configure attendance correction approval", "/settings/attendance?setupGuide=attendance&highlight=attendance-correction-rules", "attendance-correction-rules", "Choose correction deadline, approval, and manual attendance reason rules.", "Attendance correction rules are configured."),

  moduleActivity("payroll", "payroll_cycle", "Configure payroll cycle", "/settings/payroll?setupGuide=payroll&highlight=payroll-cycle", "payroll-cycle", "Set month closing day, salary payment day, and payroll period rules.", "Payroll cycle settings exist."),
  moduleActivity("payroll", "payroll_subfeatures", "Configure payroll sub-features", "/settings/payroll?setupGuide=payroll&highlight=payroll-subfeatures", "payroll-subfeatures", "Enable salary processing, payslips, advances, loans, overtime, benefits, deductions, and payroll approvals as needed.", "Payroll sub-feature settings are configured."),
  moduleActivity("payroll", "payroll_approvals", "Configure payroll approvals", "/settings/payroll?setupGuide=payroll&highlight=payroll-approvals", "payroll-approvals", "Choose whether payroll runs, adjustments, and deductions require approval.", "Payroll approval workflow has been reviewed."),

  moduleActivity("employee_management", "self_service", "Configure self-service", "/settings?setupGuide=self-service&highlight=self-service-settings", "self-service-settings", "Choose what linked employees can view or request from self-service.", "Self-service settings are reviewed."),
  moduleActivity("notifications", "notifications_alerts", "Configure notifications and alerts", "/settings/notifications?setupGuide=notifications&highlight=notification-alerts", "notification-alerts", "Enable the alerts that matter for expiry, approvals, payroll, attendance, backup, and operations.", "Notification settings exist."),
  moduleActivity("import_export", "import_export", "Confirm import/export settings", "/import-export?setupGuide=import-export&highlight=import-export-actions", "import-export-actions", "Confirm Excel import and Excel/PDF export workflows for enabled modules.", "Import/export settings are reviewed."),
  moduleActivity("approvals", "approval_workflows", "Configure approval workflows", "/settings?setupGuide=approvals&highlight=approval-workflows", "approval-workflows", "Review module-aware approval workflow behavior for leave, attendance, roster, payroll, documents, and lifecycle operations.", "Approval workflow settings are reviewed."),
];

export const SETUP_GUIDE_MODULE_KEYS = new Set(
  SETUP_GUIDE_ACTIVITIES.map((activity) => activity.module_key).filter((key): key is string => Boolean(key)),
);
