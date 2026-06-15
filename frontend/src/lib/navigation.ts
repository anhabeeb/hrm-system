import {
  Archive,
  BadgeCheck,
  Banknote,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileClock,
  DatabaseBackup,
  FileCog,
  FileCheck2,
  FileArchive,
  FileText,
  Download,
  Upload,
  FileSignature,
  Fingerprint,
  History,
  IdCard,
  Landmark,
  LayoutDashboard,
  PackageCheck,
  ReceiptText,
  Repeat,
  Settings,
  ShieldCheck,
  Shirt,
  TabletSmartphone,
  UserCircle,
  Users,
  WalletCards,
} from "lucide-react";

import type { CurrentUser } from "@/types/auth";
import type { NavGroup, NavItem } from "@/types/navigation";

import { isModuleEnabled } from "./features";
import { hasAnyPermission, hasPermission } from "./permissions";

export const navigationGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, requiredPermissionsAny: ["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"] },
      { label: "Notifications", path: "/notifications", icon: Bell, requiredPermissionsAny: ["notifications.view", "notifications.manage_own"] },
      { label: "Expiry Alerts", path: "/expiry-alerts", icon: FileClock, requiredPermissionsAny: ["expiry_alerts.view", "expiry_alerts.view_own"] },
    ],
  },
  {
    label: "Self-Service",
    items: [
      { label: "Employee Dashboard", path: "/self/dashboard", icon: LayoutDashboard, requiredPermission: "self.dashboard.view", requiresLinkedEmployee: true },
      { label: "My Profile", path: "/self/profile", icon: UserCircle, requiredPermissionsAny: ["self.profile.view", "self.dashboard.view"], requiresLinkedEmployee: true },
      { label: "My Attendance", path: "/self/attendance", icon: Clock3, moduleCode: "attendance", requiredFeature: "attendance", requiredPermission: "self.attendance.view", requiresLinkedEmployee: true },
      { label: "My Roster", path: "/self/roster", icon: CalendarDays, moduleCode: "roster", requiredFeature: "roster", requiredPermission: "self.roster.view", requiresLinkedEmployee: true },
      { label: "My Leave", path: "/self/leave", icon: CalendarClock, moduleCode: "leave", requiredFeature: "leave_management", requiredPermission: "self.leave.view", requiresLinkedEmployee: true },
      { label: "My Requests", path: "/self/requests", icon: ClipboardCheck, requiredPermission: "self.requests.view", requiresLinkedEmployee: true },
      { label: "My Documents / KYC", path: "/self/documents", icon: FileText, moduleCode: "documents_kyc", requiredFeature: "documents", requiredPermission: "self.documents.view", requiresLinkedEmployee: true },
      { label: "My Payslips", path: "/self/payslips", icon: ReceiptText, moduleCode: "payslips", requiredFeature: "payslips", requiredPermission: "self.payslips.view", requiresLinkedEmployee: true },
      { label: "My Pending Approvals", path: "/self/pending-approvals", icon: FileCheck2, requiredPermissionsAny: ["department.approvals.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"], requiresLinkedEmployee: true },
      { label: "Department Dashboard", path: "/self/department-dashboard", icon: Building2, requiredPermission: "department.dashboard.view", requiresLinkedEmployee: true },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Employees", path: "/employees", icon: Users, moduleCode: "employees", requiredFeature: "employee_management", requiredPermission: "employees.view" },
      { label: "Contracts", path: "/contracts", icon: FileSignature, moduleCode: "employees", requiredFeature: "employee_management", requiredPermissionsAny: ["contracts.view", "employees.contracts.view", "employees.view"] },
      { label: "Offboarding", path: "/offboarding", icon: FileCheck2, moduleCode: "resignation_offboarding", requiredFeature: "employee_lifecycle", requiredPermissionsAny: ["employeeLifecycle.resignations.viewOwn", "employeeLifecycle.resignations.view", "employeeLifecycle.resignations.create", "employeeLifecycle.offboarding.viewOwn", "employeeLifecycle.offboarding.view", "employeeLifecycle.offboarding.create", "employeeLifecycle.exitRequests.viewAll", "approvals.operationOwner.view", "approvals.operationFinal.view", "approvals.operationExecutor.view", "employees.offboarding.view", "employees.view"] },
      { label: "Disciplinary Actions", path: "/disciplinary-actions", icon: FileCog, moduleCode: "disciplinary_actions", requiredFeature: "employee_discipline", requiredPermissionsAny: ["employeeDiscipline.actions.view", "employeeDiscipline.actions.viewOwn", "employeeDiscipline.actions.create", "employeeDiscipline.actions.review", "employeeDiscipline.actions.apply", "employeeDiscipline.tasks.view", "approvals.operationOwner.view", "approvals.operationFinal.view", "approvals.operationExecutor.view"] },
      { label: "Outlets", path: "/outlets", icon: Building2, requiredFeature: "employee_management", requiredPermission: "outlets.view" },
    ],
  },
  {
    label: "Organization",
    items: [
      { label: "Departments", path: "/departments", icon: BriefcaseBusiness, moduleCode: "employee_structure", requiredFeature: "employee_management", requiredPermissionsAny: ["organization.departments.view", "departments.view"] },
      { label: "Positions / Titles", path: "/positions", icon: BadgeCheck, moduleCode: "employee_structure", requiredFeature: "employee_management", requiredPermissionsAny: ["organization.positions.view", "positions.view"] },
      { label: "Level Role Templates", path: "/organization/level-role-templates", icon: ShieldCheck, moduleCode: "employee_structure", requiredFeature: "employee_management", requiredPermissionsAny: ["organization.levelRoleTemplates.view", "organization.levelRoleTemplates.manage"] },
      { label: "Structure Change Requests", path: "/organization/structure-change-requests", icon: FileCheck2, moduleCode: "employee_structure_changes", requiredFeature: "employee_structure_changes", requiredPermissionsAny: ["employees.structureRequests.view", "employees.structureRequests.create", "employees.structureRequests.review", "employees.structureRequests.apply"] },
      { label: "Operation Ownership", path: "/organization/operation-ownership", icon: ShieldCheck, moduleCode: "operation_ownership", requiredFeature: "operation_ownership", requiredPermissionsAny: ["operationOwnership.view", "operationOwnership.matrix.view", "operationOwnership.businessFunctions.view"] },
    ],
  },
  {
    label: "Time & Attendance",
    items: [
      { label: "Attendance", path: "/attendance", icon: Clock3, requiredFeature: "attendance", requiredPermission: "attendance.view" },
      { label: "Time Corrections", path: "/attendance/corrections", icon: FileClock, requiredFeature: "attendance", requiredPermission: "attendance.view" },
      { label: "Attendance Reports", path: "/attendance/reports", icon: BarChart3, requiredFeature: "attendance", requiredPermission: "attendance.reports.view" },
      { label: "Duty Rosters", path: "/rosters", icon: CalendarDays, moduleCode: "roster", requiredFeature: "roster", requiredPermissionsAny: ["rosters.view", "roster.view"] },
      { label: "Kiosk Devices", path: "/kiosk-devices", icon: TabletSmartphone, requiredFeature: "offline_sync", requiredPermissionsAny: ["devices.view", "kiosk.view"] },
      { label: "Sync Status", path: "/sync-status", icon: Repeat, requiredFeature: "offline_sync", requiredPermission: "sync.view" },
      { label: "Biometric", path: "/biometric", icon: Fingerprint, moduleCode: "biometric", requiredFeature: "biometric_attendance", requiredPermission: "biometric.view" },
    ],
  },
  {
    label: "Leave & Payroll",
    items: [
      { label: "Leave", path: "/leave", icon: CalendarClock, moduleCode: "leave", requiredFeature: "leave_management", requiredPermission: "leave.view" },
      { label: "Holiday Calendar", path: "/holidays", icon: CalendarDays, requiredFeature: "holidays", requiredPermissionsAny: ["holidays.view", "holidays.calendar.view"] },
      { label: "Long Leave", path: "/long-leave", icon: FileArchive, requiredFeature: "long_leave", requiredPermission: "long_leave.view" },
      { label: "Payroll", path: "/payroll", icon: Landmark, moduleCode: "payroll", requiredFeature: "payroll", requiredPermission: "payroll.view" },
      { label: "Payslips", path: "/payslips", icon: ReceiptText, moduleCode: "payslips", requiredFeature: "payslips", requiredPermission: "payslips.view" },
      { label: "Advances", path: "/advances", icon: WalletCards, moduleCode: "advance_salary", requiredFeature: "advance_salary", requiredPermission: "advances.view" },
      { label: "Salary Loans", path: "/salary-loans", icon: Banknote, requiredFeature: "payroll", requiredPermission: "salary_loans.view" },
    ],
  },
  {
    label: "Assets & Documents",
    items: [
      { label: "Assets", path: "/assets", icon: PackageCheck, requiredFeature: "assets_uniforms", requiredPermission: "assets.view" },
      { label: "Uniforms", path: "/uniforms", icon: Shirt, requiredFeature: "assets_uniforms", requiredPermission: "uniforms.view" },
      { label: "Documents", path: "/documents", icon: FileText, moduleCode: "documents_kyc", requiredFeature: "documents", requiredPermission: "documents.view" },
    ],
  },
  {
    label: "Workflow",
    items: [{ label: "Approvals", path: "/approvals", icon: ClipboardCheck, moduleCode: "approvals", requiredFeature: "approvals", requiredPermission: "approvals.view" }],
  },
  {
    label: "Reports & Data",
    items: [
      { label: "HR Reports", path: "/hr-reports", icon: BarChart3, requiredFeature: "reports", requiredPermissionsAny: ["hr_reports.view", "hr_reports.catalog.view"] },
      { label: "Payroll / Finance Reports", path: "/payroll-reports", icon: Landmark, requiredFeature: "reports", requiredPermissionsAny: ["payroll_reports.view", "payroll_reports.catalog.view"] },
      { label: "Export History", path: "/report-exports", icon: Download, requiredFeature: "reports", requiredPermissionsAny: ["report_exports.history.view", "report_exports.admin.manage"] },
      { label: "Import Center", path: "/imports", icon: Upload, requiredFeature: "import_export", requiredPermissionsAny: ["imports.view", "imports.upload", "imports.templates.view"] },
      { label: "Reports", path: "/reports", icon: BarChart3, requiredFeature: "reports", requiredPermission: "reports.view" },
      { label: "Import / Export", path: "/import-export", icon: Archive, requiredFeature: "import_export", requiredPermissionsAny: ["export.view", "import.view"] },
      { label: "Backup & Recovery", path: "/backup-recovery", icon: DatabaseBackup, requiredFeature: "backup_recovery", requiredPermissionsAny: ["backup.view", "backup.view_history", "backup.restore_request"] },
      { label: "Data Retention", path: "/data-retention", icon: FileArchive, requiredFeature: "backup_recovery", requiredPermissionsAny: ["data_retention.view", "data_retention.preview"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users & Access", path: "/users-access", icon: ShieldCheck, requiredFeature: "user_management", requiredPermission: "users.view" },
      { label: "Profile Update Requests", path: "/profile-update-requests", icon: IdCard, moduleCode: "documents_kyc", requiredFeature: "kyc_update_requests", requiredPermissionsAny: ["profile_updates.view", "profile_update_requests.view"] },
      { label: "Audit Logs", path: "/audit-logs", icon: History, moduleCode: "audit", requiredFeature: "audit_logs", requiredPermission: "audit_logs.view" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Company Information", path: "/settings/company", icon: Building2, requiredFeature: "settings", requiredPermissionsAny: ["company.view", "settings.view"] },
      { label: "Security", path: "/settings/security", icon: ShieldCheck, requiredFeature: "settings", requiredPermissionsAny: ["security.view", "audit_settings.view", "settings.view"] },
      { label: "Attendance", path: "/settings/attendance", icon: Clock3, requiredFeature: "settings", requiredPermissionsAny: ["attendance.settings.view", "attendance_settings.view", "settings.view"] },
      { label: "Leave", path: "/settings/leave", icon: CalendarClock, requiredFeature: "settings", requiredPermissionsAny: ["leave.settings.view", "leave_settings.view", "settings.view"] },
      { label: "Payroll", path: "/settings/payroll", icon: Landmark, requiredFeature: "settings", requiredPermissionsAny: ["payroll.settings.view", "payroll_settings.view", "settings.view"] },
      { label: "Documents", path: "/settings/documents", icon: FileText, requiredFeature: "settings", requiredPermissionsAny: ["documents.settings.view", "documents_settings.manage", "settings.view"] },
      { label: "Backup & Recovery", path: "/settings/backup", icon: DatabaseBackup, requiredFeature: "settings", requiredPermissionsAny: ["backup.settings.view", "backup_settings.view", "settings.view"] },
      { label: "Notifications", path: "/settings/notifications", icon: FileCog, requiredFeature: "settings", requiredPermission: "settings.view" },
      { label: "Reports", path: "/settings/reports", icon: BarChart3, requiredFeature: "settings", requiredPermission: "settings.view" },
      { label: "Import / Export", path: "/settings/import-export", icon: Archive, requiredFeature: "settings", requiredPermissionsAny: ["import_export.settings.view", "import_export_settings.view", "settings.view"] },
      { label: "Devices & Sync", path: "/settings/devices-sync", icon: TabletSmartphone, requiredFeature: "settings", requiredPermissionsAny: ["devices.settings.view", "sync_settings.view", "settings.view"] },
      { label: "All Settings", path: "/settings", icon: Settings, requiredFeature: "settings", requiredPermission: "settings.view" },
    ],
  },
];

export const canAccessNavItem = (user: CurrentUser | null, item: NavItem) =>
  (!item.requiresLinkedEmployee || Boolean(user?.employee_id)) &&
  isModuleEnabled(user, item.moduleCode ?? item.requiredFeature) &&
  hasPermission(user, item.requiredPermission) &&
  hasAnyPermission(user, item.requiredPermissionsAny);

export const getVisibleNavigation = (user: CurrentUser | null): NavGroup[] =>
  navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessNavItem(user, item)),
    }))
    .filter((group) => group.items.length > 0);
