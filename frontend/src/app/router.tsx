import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { PermissionDenied } from "@/components/feedback/PermissionDenied";
import { ModuleRoute, ProtectedRoute, PublicRoute } from "@/features/auth/route-guards";
import { LoginPage } from "@/features/auth/LoginPage";
import { TwoFactorPage } from "@/features/auth/TwoFactorPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { FirstTimeSetupPlaceholder } from "@/features/bootstrap/FirstTimeSetupPlaceholder";
import { FirstTimeSetupPage } from "@/features/bootstrap/FirstTimeSetupPage";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { SecurityPage } from "@/features/profile/SecurityPage";
import { KycUpdatePage } from "@/features/profile/KycUpdatePage";
import { useAuth } from "@/features/auth/auth.store";
import { getDefaultLandingPath } from "@/lib/default-landing";

const lazyNamed = <T extends Record<string, ComponentType<any>>>(
  loader: () => Promise<T>,
  exportName: keyof T,
) => lazy(async () => ({ default: (await loader())[exportName] }));

const UsersAccessPage = lazyNamed(() => import("@/features/users/UsersAccessPage"), "UsersAccessPage");
const OutletsPage = lazyNamed(() => import("@/features/outlets/OutletsPage"), "OutletsPage");
const DepartmentsPage = lazyNamed(() => import("@/features/departments/DepartmentsPage"), "DepartmentsPage");
const DepartmentDashboardPage = lazyNamed(() => import("@/features/department-dashboard/DepartmentDashboardPage"), "DepartmentDashboardPage");
const PositionsPage = lazyNamed(() => import("@/features/positions/PositionsPage"), "PositionsPage");
const LevelRoleTemplatesPage = lazyNamed(() => import("@/features/organization/LevelRoleTemplatesPage"), "LevelRoleTemplatesPage");
const OperationOwnershipPage = lazyNamed(() => import("@/features/operation-ownership/OperationOwnershipPage"), "OperationOwnershipPage");
const EmployeeStructureChangeRequestsPage = lazyNamed(() => import("@/features/employee-structure-change/EmployeeStructureChangeRequestsPage"), "EmployeeStructureChangeRequestsPage");
const EmployeesPage = lazyNamed(() => import("@/features/employees/EmployeesPage"), "EmployeesPage");
const Employee360Page = lazyNamed(() => import("@/features/employees/Employee360Page"), "Employee360Page");
const ContractsPage = lazyNamed(() => import("@/features/contracts/ContractsPage"), "ContractsPage");
const OffboardingPage = lazyNamed(() => import("@/features/offboarding/OffboardingPage"), "OffboardingPage");
const DisciplinaryActionsPage = lazyNamed(() => import("@/features/discipline/DisciplinaryActionsPage"), "DisciplinaryActionsPage");
const AttendancePage = lazyNamed(() => import("@/features/attendance/AttendancePage"), "AttendancePage");
const AttendanceCorrectionsPage = lazyNamed(() => import("@/features/attendance/AttendanceCorrectionsPage"), "AttendanceCorrectionsPage");
const AttendanceReportsPage = lazyNamed(() => import("@/features/attendance/AttendanceReportsPage"), "AttendanceReportsPage");
const RostersPage = lazyNamed(() => import("@/features/rosters/RostersPage"), "RostersPage");
const KioskDevicesPage = lazyNamed(() => import("@/features/devices/KioskDevicesPage"), "KioskDevicesPage");
const SyncStatusPage = lazyNamed(() => import("@/features/sync/SyncStatusPage"), "SyncStatusPage");
const BiometricPage = lazyNamed(() => import("@/features/biometric/BiometricPage"), "BiometricPage");
const LeavePage = lazyNamed(() => import("@/features/leave/LeavePage"), "LeavePage");
const HolidayCalendarPage = lazyNamed(() => import("@/features/holidays/HolidayCalendarPage"), "HolidayCalendarPage");
const LongLeavePage = lazyNamed(() => import("@/features/long-leave/LongLeavePage"), "LongLeavePage");
const PayrollPage = lazyNamed(() => import("@/features/payroll/PayrollPage"), "PayrollPage");
const PayslipsPage = lazyNamed(() => import("@/features/payslips/PayslipsPage"), "PayslipsPage");
const AdvancesPage = lazyNamed(() => import("@/features/advances/AdvancesPage"), "AdvancesPage");
const SalaryLoansPage = lazyNamed(() => import("@/features/salary-loans/SalaryLoansPage"), "SalaryLoansPage");
const AssetsPage = lazyNamed(() => import("@/features/assets/AssetsPage"), "AssetsPage");
const UniformsPage = lazyNamed(() => import("@/features/uniforms/UniformsPage"), "UniformsPage");
const DocumentsPage = lazyNamed(() => import("@/features/documents/DocumentsPage"), "DocumentsPage");
const MyDocumentsKycPage = lazyNamed(() => import("@/features/documents/MyDocumentsKycPage"), "MyDocumentsKycPage");
const ApprovalsPage = lazyNamed(() => import("@/features/approvals/ApprovalsPage"), "ApprovalsPage");
const ReportsPage = lazyNamed(() => import("@/features/reports/ReportsPage"), "ReportsPage");
const NotificationsPage = lazyNamed(() => import("@/features/notifications/NotificationsPage"), "NotificationsPage");
const ExpiryAlertsPage = lazyNamed(() => import("@/features/expiry-alerts/ExpiryAlertsPage"), "ExpiryAlertsPage");
const HrReportsPage = lazyNamed(() => import("@/features/hr-reports/HrReportsPage"), "HrReportsPage");
const PayrollReportsPage = lazyNamed(() => import("@/features/payroll-reports/PayrollReportsPage"), "PayrollReportsPage");
const ExportHistoryPage = lazyNamed(() => import("@/features/report-exports/ExportHistoryPage"), "ExportHistoryPage");
const ImportExportPage = lazyNamed(() => import("@/features/import-export/ImportExportPage"), "ImportExportPage");
const ImportCenterPage = lazyNamed(() => import("@/features/imports/ImportCenterPage"), "ImportCenterPage");
const BackupRecoveryPage = lazyNamed(() => import("@/features/backup-recovery/BackupRecoveryPage"), "BackupRecoveryPage");
const DataRetentionPage = lazyNamed(() => import("@/features/data-retention/DataRetentionPage"), "DataRetentionPage");
const SettingsPage = lazyNamed(() => import("@/features/settings/SettingsPage"), "SettingsPage");
const CompanyInformationPage = lazyNamed(() => import("@/features/settings/company/CompanyInformationPage"), "CompanyInformationPage");
const SecuritySettingsPage = lazyNamed(() => import("@/features/settings/security/SecuritySettingsPage"), "SecuritySettingsPage");
const AttendanceSettingsPage = lazyNamed(() => import("@/features/settings/attendance/AttendanceSettingsPage"), "AttendanceSettingsPage");
const LeaveSettingsPage = lazyNamed(() => import("@/features/settings/leave/LeaveSettingsPage"), "LeaveSettingsPage");
const PayrollSettingsPage = lazyNamed(() => import("@/features/settings/payroll/PayrollSettingsPage"), "PayrollSettingsPage");
const DocumentsSettingsPage = lazyNamed(() => import("@/features/settings/documents/DocumentsSettingsPage"), "DocumentsSettingsPage");
const BackupSettingsPage = lazyNamed(() => import("@/features/settings/backup/BackupSettingsPage"), "BackupSettingsPage");
const NotificationsSettingsPage = lazyNamed(() => import("@/features/settings/notifications/NotificationsSettingsPage"), "NotificationsSettingsPage");
const ReportsSettingsPage = lazyNamed(() => import("@/features/settings/reports/ReportsSettingsPage"), "ReportsSettingsPage");
const ImportExportSettingsPage = lazyNamed(() => import("@/features/settings/import-export/ImportExportSettingsPage"), "ImportExportSettingsPage");
const DevicesSyncSettingsPage = lazyNamed(() => import("@/features/settings/devices-sync/DevicesSyncSettingsPage"), "DevicesSyncSettingsPage");
const AuditLogsPage = lazyNamed(() => import("@/features/audit/AuditLogsPage"), "AuditLogsPage");
const ProfileUpdateRequestsPage = lazyNamed(() => import("@/features/profile-update-requests/ProfileUpdateRequestsPage"), "ProfileUpdateRequestsPage");
const EmployeeDashboardPage = lazyNamed(() => import("@/features/self-service/EmployeeDashboardPage"), "EmployeeDashboardPage");
const MyProfilePage = lazyNamed(() => import("@/features/self-service/MyProfilePage"), "MyProfilePage");
const MyRequestsPage = lazyNamed(() => import("@/features/self-service/MyRequestsPage"), "MyRequestsPage");
const MyPendingApprovalsPage = lazyNamed(() => import("@/features/self-service/MyPendingApprovalsPage"), "MyPendingApprovalsPage");
const SelfServiceModulePage = lazyNamed(() => import("@/features/self-service/SelfServiceModulePage"), "SelfServiceModulePage");
const EmployeeAttendanceCalendarPage = lazyNamed(() => import("@/features/attendance-calendar/EmployeeAttendanceCalendarPage"), "EmployeeAttendanceCalendarPage");

const routeFallback = (
  <div className="p-4 text-sm text-muted-foreground md:p-6">Loading page...</div>
);

const guarded = (
  element: ReactNode,
  options: { permission?: string; permissionsAny?: string[]; feature?: string; featuresAll?: string[]; moduleCode?: string; moduleCodesAll?: string[]; moduleName?: string; requiresLinkedEmployee?: boolean } = {},
) => (
  <ModuleRoute
    requiredPermission={options.permission}
    requiredPermissionsAny={options.permissionsAny}
    requiredFeature={options.feature}
    requiredFeaturesAll={options.featuresAll}
    moduleCode={options.moduleCode}
    moduleCodesAll={options.moduleCodesAll}
    moduleName={options.moduleName}
    requiresLinkedEmployee={options.requiresLinkedEmployee}
  >
    {element}
  </ModuleRoute>
);

const DefaultLandingRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={getDefaultLandingPath(user)} replace />;
};

export const AppRouter = () => (
  <Suspense fallback={routeFallback}>
  <Routes>
    <Route element={<PublicRoute />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/2fa" element={<TwoFactorPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Route>
    <Route path="/setup" element={<FirstTimeSetupPage />} />
    <Route path="/setup-placeholder" element={<FirstTimeSetupPlaceholder />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route index element={<DefaultLandingRedirect />} />
        <Route path="/dashboard" element={guarded(<DashboardPage />, { permissionsAny: ["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"] })} />
        <Route path="/self/dashboard" element={guarded(<EmployeeDashboardPage />, { permission: "self.dashboard.view", requiresLinkedEmployee: true })} />
        <Route path="/self/profile" element={guarded(<MyProfilePage />, { permissionsAny: ["self.profile.view", "self.dashboard.view"], requiresLinkedEmployee: true })} />
        <Route path="/self/requests" element={guarded(<MyRequestsPage />, { permission: "self.requests.view", requiresLinkedEmployee: true })} />
        <Route path="/self/pending-approvals" element={guarded(<MyPendingApprovalsPage />, { permissionsAny: ["department.approvals.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"], requiresLinkedEmployee: true })} />
        <Route path="/self/attendance" element={guarded(<SelfServiceModulePage moduleKey="attendance" />, { permission: "self.attendance.view", feature: "attendance", moduleCode: "attendance", requiresLinkedEmployee: true })} />
        <Route path="/self/attendance-calendar" element={guarded(<EmployeeAttendanceCalendarPage />, { permissionsAny: ["self.attendance.calendar.view", "self.attendance.view"], feature: "attendance", moduleCode: "attendance", requiresLinkedEmployee: true })} />
        <Route path="/self/roster" element={guarded(<SelfServiceModulePage moduleKey="roster" />, { permission: "self.roster.view", feature: "roster", moduleCode: "roster", requiresLinkedEmployee: true })} />
        <Route path="/self/leave" element={guarded(<SelfServiceModulePage moduleKey="leave" />, { permission: "self.leave.view", feature: "leave_management", moduleCode: "leave", requiresLinkedEmployee: true })} />
        <Route path="/self/documents" element={guarded(<MyDocumentsKycPage />, { permission: "self.documents.view", feature: "documents", moduleCode: "documents_kyc", requiresLinkedEmployee: true })} />
        <Route path="/self/payslips" element={guarded(<SelfServiceModulePage moduleKey="payslips" />, { permission: "self.payslips.view", feature: "payslips", moduleCode: "payslips", requiresLinkedEmployee: true })} />
        <Route path="/self/department-dashboard" element={guarded(<DepartmentDashboardPage selfService />, { permissionsAny: ["department.dashboard.view", "departments.dashboard.viewTeam", "attendance.teamCalendar.view", "attendance.calendar.viewTeam", "employees.team.view"], featuresAll: ["employee_management", "attendance"], moduleCodesAll: ["employees", "attendance"], requiresLinkedEmployee: true })} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/security" element={<SecurityPage />} />
        <Route path="/profile/kyc-update" element={<KycUpdatePage />} />
        <Route path="/notifications" element={guarded(<NotificationsPage />, { permissionsAny: ["notifications.view", "notifications.manage_own"] })} />
        <Route path="/expiry-alerts" element={guarded(<ExpiryAlertsPage />, { permissionsAny: ["expiry_alerts.view", "expiry_alerts.view_own"] })} />
        <Route path="/employees" element={guarded(<EmployeesPage />, { permission: "employees.view", feature: "employee_management" })} />
        <Route path="/employees/:employeeId" element={guarded(<Employee360Page />, { permission: "employees.view", feature: "employee_management" })} />
        <Route path="/contracts" element={guarded(<ContractsPage />, { permissionsAny: ["contracts.view", "employees.contracts.view", "employees.view"], feature: "employee_management" })} />
        <Route path="/offboarding" element={guarded(<OffboardingPage />, { permissionsAny: ["employeeLifecycle.resignations.viewOwn", "employeeLifecycle.resignations.view", "employeeLifecycle.resignations.create", "employeeLifecycle.offboarding.viewOwn", "employeeLifecycle.offboarding.view", "employeeLifecycle.offboarding.create", "employeeLifecycle.exitRequests.viewAll", "approvals.operationOwner.view", "approvals.operationFinal.view", "approvals.operationExecutor.view", "employees.offboarding.view", "employees.view"], feature: "employee_lifecycle", moduleCode: "resignation_offboarding" })} />
        <Route path="/disciplinary-actions" element={guarded(<DisciplinaryActionsPage />, { permissionsAny: ["employeeDiscipline.actions.view", "employeeDiscipline.actions.viewOwn", "employeeDiscipline.actions.create", "employeeDiscipline.actions.review", "employeeDiscipline.actions.apply", "employeeDiscipline.tasks.view", "approvals.operationOwner.view", "approvals.operationFinal.view", "approvals.operationExecutor.view"], feature: "employee_discipline", moduleCode: "disciplinary_actions" })} />
        <Route path="/users-access" element={guarded(<UsersAccessPage />, { permission: "users.view", feature: "user_management" })} />
        <Route path="/outlets" element={guarded(<OutletsPage />, { permission: "outlets.view", feature: "employee_management" })} />
        <Route path="/departments" element={guarded(<DepartmentsPage />, { permissionsAny: ["organization.departments.view", "departments.view"], feature: "employee_management" })} />
        <Route path="/departments/dashboard" element={guarded(<DepartmentDashboardPage />, { permissionsAny: ["departments.dashboard.view", "departments.dashboard.viewTeam", "departments.dashboard.viewAll", "attendance.teamCalendar.view", "attendance.calendar.viewTeam", "employees.team.view", "department.dashboard.view", "employees.view"], featuresAll: ["employee_management", "attendance"], moduleCodesAll: ["employees", "attendance"] })} />
        <Route path="/positions" element={guarded(<PositionsPage />, { permissionsAny: ["organization.positions.view", "positions.view"], feature: "employee_management" })} />
        <Route path="/organization/level-role-templates" element={guarded(<LevelRoleTemplatesPage />, { permissionsAny: ["organization.levelRoleTemplates.view", "organization.levelRoleTemplates.manage"], feature: "employee_management" })} />
        <Route path="/organization/structure-change-requests" element={guarded(<EmployeeStructureChangeRequestsPage />, { permissionsAny: ["employees.structureRequests.view", "employees.structureRequests.create", "employees.structureRequests.review", "employees.structureRequests.apply"], feature: "employee_structure_changes", moduleCode: "employee_structure_changes" })} />
        <Route path="/organization/operation-ownership" element={guarded(<OperationOwnershipPage />, { permissionsAny: ["operationOwnership.view", "operationOwnership.matrix.view", "operationOwnership.businessFunctions.view"], feature: "operation_ownership", moduleCode: "operation_ownership" })} />
        <Route path="/attendance" element={guarded(<AttendancePage />, { permission: "attendance.view", feature: "attendance" })} />
        <Route path="/attendance/calendar" element={guarded(<EmployeeAttendanceCalendarPage />, { permissionsAny: ["attendance.calendar.view", "attendance.calendar.viewTeam", "attendance.calendar.viewAll", "attendance.view", "attendance.reports.view"], feature: "attendance", moduleCode: "attendance" })} />
        <Route path="/attendance/corrections" element={guarded(<AttendanceCorrectionsPage />, { permission: "attendance.view", feature: "attendance" })} />
        <Route path="/attendance/reports" element={guarded(<AttendanceReportsPage />, { permission: "attendance.reports.view", feature: "attendance" })} />
        <Route path="/rosters" element={guarded(<RostersPage />, { permissionsAny: ["rosters.weeklyMatrix.view", "rosters.weeklyMatrix.viewTeam", "rosters.weeklyMatrix.viewAll", "rosters.view", "roster.view"], featuresAll: ["roster", "employee_management"], moduleCodesAll: ["roster", "employees"] })} />
        <Route path="/kiosk-devices" element={guarded(<KioskDevicesPage />, { permissionsAny: ["devices.view", "kiosk.view"], feature: "offline_sync" })} />
        <Route path="/sync-status" element={guarded(<SyncStatusPage />, { permission: "sync.view", feature: "offline_sync" })} />
        <Route path="/biometric" element={guarded(<BiometricPage />, { permissionsAny: ["biometric.view", "devices.view"], feature: "biometric_attendance" })} />
        <Route path="/leave" element={guarded(<LeavePage />, { permission: "leave.view", feature: "leave_management" })} />
        <Route path="/holidays" element={guarded(<HolidayCalendarPage />, { permissionsAny: ["holidays.view", "holidays.calendar.view"], feature: "holidays" })} />
        <Route path="/long-leave" element={guarded(<LongLeavePage />, { permission: "long_leave.view", feature: "long_leave" })} />
        <Route path="/payroll" element={guarded(<PayrollPage />, { permission: "payroll.view", feature: "payroll" })} />
        <Route path="/payroll/attendance-review" element={guarded(<EmployeeAttendanceCalendarPage />, { permissionsAny: ["payroll.attendanceReview.view", "payroll.view"], feature: "payroll", moduleCode: "payroll", featuresAll: ["payroll", "attendance"], moduleCodesAll: ["payroll", "attendance"] })} />
        <Route path="/payslips" element={guarded(<PayslipsPage />, { permission: "payslips.view", feature: "payslips" })} />
        <Route path="/advances" element={guarded(<AdvancesPage />, { permission: "advances.view", feature: "advance_salary", moduleCode: "advance_salary" })} />
        <Route path="/salary-loans" element={guarded(<SalaryLoansPage />, { permission: "salary_loans.view", feature: "payroll" })} />
        <Route path="/assets" element={guarded(<AssetsPage />, { permission: "assets.view", feature: "asset_tracking", moduleCode: "asset_tracking", moduleName: "Asset Tracking" })} />
        <Route path="/uniforms" element={guarded(<UniformsPage />, { permission: "uniforms.view", feature: "uniform_tracking", moduleCode: "uniform_tracking", moduleName: "Uniform Tracking" })} />
        <Route path="/documents" element={guarded(<DocumentsPage />, { permission: "documents.view", feature: "documents", moduleCode: "documents_kyc" })} />
        <Route path="/approvals" element={guarded(<ApprovalsPage />, { permission: "approvals.view", feature: "approvals", moduleCode: "approvals" })} />
        <Route path="/reports" element={guarded(<ReportsPage />, { permission: "reports.view", feature: "reports" })} />
        <Route path="/hr-reports" element={guarded(<HrReportsPage />, { permissionsAny: ["hr_reports.view", "hr_reports.catalog.view"], feature: "reports" })} />
        <Route path="/payroll-reports" element={guarded(<PayrollReportsPage />, { permissionsAny: ["payroll_reports.view", "payroll_reports.catalog.view"], feature: "reports" })} />
        <Route path="/report-exports" element={guarded(<ExportHistoryPage />, { permissionsAny: ["report_exports.history.view", "report_exports.admin.manage"], feature: "reports" })} />
        <Route path="/imports" element={guarded(<ImportCenterPage />, { permissionsAny: ["imports.view", "imports.upload", "imports.templates.view"], feature: "import_export" })} />
        <Route path="/import-export" element={guarded(<ImportExportPage />, { permissionsAny: ["export.view", "import.view"], feature: "import_export" })} />
        <Route path="/backup-recovery" element={guarded(<BackupRecoveryPage />, { permissionsAny: ["backup.view", "backup.view_history", "backup.restore_request"], feature: "backup_recovery" })} />
        <Route path="/data-retention" element={guarded(<DataRetentionPage />, { permissionsAny: ["data_retention.view", "data_retention.preview"], feature: "backup_recovery" })} />
        <Route path="/settings" element={guarded(<SettingsPage />, { permission: "settings.view", feature: "settings" })} />
        <Route path="/settings/company" element={guarded(<CompanyInformationPage />, { permissionsAny: ["company.view", "settings.view"], feature: "settings" })} />
        <Route path="/settings/security" element={guarded(<SecuritySettingsPage />, { permissionsAny: ["security.view", "audit_settings.view", "settings.view"], feature: "settings" })} />
        <Route path="/settings/attendance" element={guarded(<AttendanceSettingsPage />, { permissionsAny: ["attendance.settings.view", "attendance_settings.view", "settings.view"], feature: "settings" })} />
        <Route path="/settings/leave" element={guarded(<LeaveSettingsPage />, { permissionsAny: ["leave.settings.view", "leave_settings.view", "settings.view"], feature: "settings" })} />
        <Route path="/settings/payroll" element={guarded(<PayrollSettingsPage />, { permissionsAny: ["payroll.settings.view", "payroll_settings.view", "settings.view"], feature: "settings" })} />
        <Route path="/settings/documents" element={guarded(<DocumentsSettingsPage />, { permissionsAny: ["documents.settings.view", "documents_settings.manage", "settings.view"], feature: "settings" })} />
        <Route path="/settings/backup" element={guarded(<BackupSettingsPage />, { permissionsAny: ["backup.settings.view", "backup_settings.view", "settings.view"], feature: "settings" })} />
        <Route path="/settings/notifications" element={guarded(<NotificationsSettingsPage />, { permissionsAny: ["notifications.settings.view", "settings.view"], feature: "settings" })} />
        <Route path="/settings/reports" element={guarded(<ReportsSettingsPage />, { permissionsAny: ["reports.settings.view", "settings.view"], feature: "settings" })} />
        <Route path="/settings/import-export" element={guarded(<ImportExportSettingsPage />, { permissionsAny: ["import_export.settings.view", "import_export_settings.view", "settings.view"], feature: "settings" })} />
        <Route path="/settings/devices-sync" element={guarded(<DevicesSyncSettingsPage />, { permissionsAny: ["devices.settings.view", "sync_settings.view", "settings.view"], feature: "settings" })} />
        <Route path="/profile-update-requests" element={guarded(<ProfileUpdateRequestsPage />, { permissionsAny: ["profile_updates.view", "profile_update_requests.view"], feature: "kyc_update_requests", moduleCode: "documents_kyc" })} />
        <Route path="/audit-logs" element={guarded(<AuditLogsPage />, { permission: "audit_logs.view", feature: "audit_logs" })} />
        <Route path="*" element={<PermissionDenied />} />
      </Route>
    </Route>
  </Routes>
  </Suspense>
);
