import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { PermissionDenied } from "@/components/feedback/PermissionDenied";
import { ModuleRoute, ProtectedRoute, PublicRoute } from "@/features/auth/route-guards";
import { LoginPage } from "@/features/auth/LoginPage";
import { TwoFactorPage } from "@/features/auth/TwoFactorPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { UsersAccessPage } from "@/features/users/UsersAccessPage";
import { OutletsPage } from "@/features/outlets/OutletsPage";
import { DepartmentsPage } from "@/features/departments/DepartmentsPage";
import { PositionsPage } from "@/features/positions/PositionsPage";
import { EmployeesPage } from "@/features/employees/EmployeesPage";
import { ContractsPage } from "@/features/contracts/ContractsPage";
import { OffboardingPage } from "@/features/offboarding/OffboardingPage";
import { AttendancePage } from "@/features/attendance/AttendancePage";
import { AttendanceCorrectionsPage } from "@/features/attendance/AttendanceCorrectionsPage";
import { KioskDevicesPage } from "@/features/devices/KioskDevicesPage";
import { SyncStatusPage } from "@/features/sync/SyncStatusPage";
import { BiometricPage } from "@/features/biometric/BiometricPage";
import { LeavePage } from "@/features/leave/LeavePage";
import { LongLeavePage } from "@/features/long-leave/LongLeavePage";
import { PayrollPage } from "@/features/payroll/PayrollPage";
import { PayslipsPage } from "@/features/payslips/PayslipsPage";
import { AdvancesPage } from "@/features/advances/AdvancesPage";
import { SalaryLoansPage } from "@/features/salary-loans/SalaryLoansPage";
import { AssetsPage } from "@/features/assets/AssetsPage";
import { UniformsPage } from "@/features/uniforms/UniformsPage";
import { DocumentsPage } from "@/features/documents/DocumentsPage";
import { ApprovalsPage } from "@/features/approvals/ApprovalsPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { ImportExportPage } from "@/features/import-export/ImportExportPage";
import { BackupRecoveryPage } from "@/features/backup-recovery/BackupRecoveryPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { CompanyInformationPage } from "@/features/settings/company/CompanyInformationPage";
import { SecuritySettingsPage } from "@/features/settings/security/SecuritySettingsPage";
import { AttendanceSettingsPage } from "@/features/settings/attendance/AttendanceSettingsPage";
import { LeaveSettingsPage } from "@/features/settings/leave/LeaveSettingsPage";
import { PayrollSettingsPage } from "@/features/settings/payroll/PayrollSettingsPage";
import { DocumentsSettingsPage } from "@/features/settings/documents/DocumentsSettingsPage";
import { BackupSettingsPage } from "@/features/settings/backup/BackupSettingsPage";
import { NotificationsSettingsPage } from "@/features/settings/notifications/NotificationsSettingsPage";
import { ReportsSettingsPage } from "@/features/settings/reports/ReportsSettingsPage";
import { ImportExportSettingsPage } from "@/features/settings/import-export/ImportExportSettingsPage";
import { DevicesSyncSettingsPage } from "@/features/settings/devices-sync/DevicesSyncSettingsPage";
import { AuditLogsPage } from "@/features/audit/AuditLogsPage";
import { ProfileUpdateRequestsPage } from "@/features/profile-update-requests/ProfileUpdateRequestsPage";
import { FirstTimeSetupPlaceholder } from "@/features/bootstrap/FirstTimeSetupPlaceholder";
import { FirstTimeSetupPage } from "@/features/bootstrap/FirstTimeSetupPage";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { SecurityPage } from "@/features/profile/SecurityPage";
import { KycUpdatePage } from "@/features/profile/KycUpdatePage";

const guarded = (
  element: ReactNode,
  options: { permission?: string; permissionsAny?: string[]; feature?: string } = {},
) => (
  <ModuleRoute
    requiredPermission={options.permission}
    requiredPermissionsAny={options.permissionsAny}
    requiredFeature={options.feature}
  >
    {element}
  </ModuleRoute>
);

export const AppRouter = () => (
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
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/security" element={<SecurityPage />} />
        <Route path="/profile/kyc-update" element={<KycUpdatePage />} />
        <Route path="/employees" element={guarded(<EmployeesPage />, { permission: "employees.view", feature: "employee_management" })} />
        <Route path="/contracts" element={guarded(<ContractsPage />, { permissionsAny: ["contracts.view", "employees.contracts.view", "employees.view"], feature: "employee_management" })} />
        <Route path="/offboarding" element={guarded(<OffboardingPage />, { permissionsAny: ["employees.offboarding.view", "employees.view"], feature: "employee_management" })} />
        <Route path="/users-access" element={guarded(<UsersAccessPage />, { permission: "users.view", feature: "user_management" })} />
        <Route path="/outlets" element={guarded(<OutletsPage />, { permission: "outlets.view", feature: "employee_management" })} />
        <Route path="/departments" element={guarded(<DepartmentsPage />, { permission: "departments.view", feature: "employee_management" })} />
        <Route path="/positions" element={guarded(<PositionsPage />, { permission: "positions.view", feature: "employee_management" })} />
        <Route path="/attendance" element={guarded(<AttendancePage />, { permission: "attendance.view", feature: "attendance" })} />
        <Route path="/attendance/corrections" element={guarded(<AttendanceCorrectionsPage />, { permission: "attendance.view", feature: "attendance" })} />
        <Route path="/kiosk-devices" element={guarded(<KioskDevicesPage />, { permissionsAny: ["devices.view", "kiosk.view"], feature: "offline_sync" })} />
        <Route path="/sync-status" element={guarded(<SyncStatusPage />, { permission: "sync.view", feature: "offline_sync" })} />
        <Route path="/biometric" element={guarded(<BiometricPage />, { permissionsAny: ["biometric.view", "devices.view"], feature: "biometric_attendance" })} />
        <Route path="/leave" element={guarded(<LeavePage />, { permission: "leave.view", feature: "leave_management" })} />
        <Route path="/long-leave" element={guarded(<LongLeavePage />, { permission: "long_leave.view", feature: "long_leave" })} />
        <Route path="/payroll" element={guarded(<PayrollPage />, { permission: "payroll.view", feature: "payroll" })} />
        <Route path="/payslips" element={guarded(<PayslipsPage />, { permission: "payslips.view", feature: "payslips" })} />
        <Route path="/advances" element={guarded(<AdvancesPage />, { permission: "advances.view", feature: "payroll" })} />
        <Route path="/salary-loans" element={guarded(<SalaryLoansPage />, { permission: "salary_loans.view", feature: "payroll" })} />
        <Route path="/assets" element={guarded(<AssetsPage />, { permission: "assets.view", feature: "assets_uniforms" })} />
        <Route path="/uniforms" element={guarded(<UniformsPage />, { permission: "uniforms.view", feature: "assets_uniforms" })} />
        <Route path="/documents" element={guarded(<DocumentsPage />, { permission: "documents.view", feature: "documents" })} />
        <Route path="/approvals" element={guarded(<ApprovalsPage />, { permission: "approvals.view", feature: "approvals" })} />
        <Route path="/reports" element={guarded(<ReportsPage />, { permission: "reports.view", feature: "reports" })} />
        <Route path="/import-export" element={guarded(<ImportExportPage />, { permissionsAny: ["export.view", "import.view"], feature: "import_export" })} />
        <Route path="/backup-recovery" element={guarded(<BackupRecoveryPage />, { permissionsAny: ["backup.view", "backup.view_history", "backup.restore_request"], feature: "backup_recovery" })} />
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
        <Route path="/profile-update-requests" element={guarded(<ProfileUpdateRequestsPage />, { permissionsAny: ["profile_updates.view", "profile_update_requests.view"], feature: "kyc_update_requests" })} />
        <Route path="/audit-logs" element={guarded(<AuditLogsPage />, { permission: "audit_logs.view", feature: "audit_logs" })} />
        <Route path="*" element={<PermissionDenied />} />
      </Route>
    </Route>
  </Routes>
);
