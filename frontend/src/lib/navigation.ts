import {
  Archive,
  BadgeCheck,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  FileClock,
  DatabaseBackup,
  FileArchive,
  FileText,
  Fingerprint,
  History,
  Landmark,
  LayoutDashboard,
  PackageCheck,
  ReceiptText,
  Repeat,
  Settings,
  ShieldCheck,
  Shirt,
  TabletSmartphone,
  Users,
  WalletCards,
} from "lucide-react";

import type { CurrentUser } from "@/types/auth";
import type { NavGroup, NavItem } from "@/types/navigation";

import { hasFeature } from "./features";
import { hasAnyPermission, hasPermission } from "./permissions";

export const navigationGroups: NavGroup[] = [
  {
    label: "Main",
    items: [{ label: "Dashboard", path: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "People",
    items: [
      { label: "Employees", path: "/employees", icon: Users, requiredFeature: "employee_management", requiredPermission: "employees.view" },
      { label: "Users & Access", path: "/users-access", icon: ShieldCheck, requiredFeature: "user_management", requiredPermission: "users.view" },
      { label: "Outlets", path: "/outlets", icon: Building2, requiredFeature: "employee_management", requiredPermission: "outlets.view" },
      { label: "Departments", path: "/departments", icon: BriefcaseBusiness, requiredFeature: "employee_management", requiredPermission: "departments.view" },
      { label: "Positions", path: "/positions", icon: BadgeCheck, requiredFeature: "employee_management", requiredPermission: "positions.view" },
    ],
  },
  {
    label: "Time & Attendance",
    items: [
      { label: "Attendance", path: "/attendance", icon: Clock3, requiredFeature: "attendance", requiredPermission: "attendance.view" },
      { label: "Time Corrections", path: "/attendance/corrections", icon: FileClock, requiredFeature: "attendance", requiredPermission: "attendance.view" },
      { label: "Kiosk Devices", path: "/kiosk-devices", icon: TabletSmartphone, requiredFeature: "offline_sync", requiredPermissionsAny: ["devices.view", "kiosk.view"] },
      { label: "Sync Status", path: "/sync-status", icon: Repeat, requiredFeature: "offline_sync", requiredPermission: "sync.view" },
      { label: "Biometric", path: "/biometric", icon: Fingerprint, requiredFeature: "biometric_attendance", requiredPermission: "biometric.view" },
    ],
  },
  {
    label: "Leave & Payroll",
    items: [
      { label: "Leave", path: "/leave", icon: CalendarClock, requiredFeature: "leave_management", requiredPermission: "leave.view" },
      { label: "Long Leave", path: "/long-leave", icon: FileArchive, requiredFeature: "long_leave", requiredPermission: "long_leave.view" },
      { label: "Payroll", path: "/payroll", icon: Landmark, requiredFeature: "payroll", requiredPermission: "payroll.view" },
      { label: "Payslips", path: "/payslips", icon: ReceiptText, requiredFeature: "payslips", requiredPermission: "payslips.view" },
      { label: "Advances", path: "/advances", icon: WalletCards, requiredFeature: "payroll", requiredPermission: "advances.view" },
      { label: "Salary Loans", path: "/salary-loans", icon: Banknote, requiredFeature: "payroll", requiredPermission: "salary_loans.view" },
    ],
  },
  {
    label: "Assets & Documents",
    items: [
      { label: "Assets", path: "/assets", icon: PackageCheck, requiredFeature: "assets_uniforms", requiredPermission: "assets.view" },
      { label: "Uniforms", path: "/uniforms", icon: Shirt, requiredFeature: "assets_uniforms", requiredPermission: "uniforms.view" },
      { label: "Documents", path: "/documents", icon: FileText, requiredFeature: "documents", requiredPermission: "documents.view" },
    ],
  },
  {
    label: "Workflow",
    items: [{ label: "Approvals", path: "/approvals", icon: ClipboardCheck, requiredFeature: "approvals", requiredPermission: "approvals.view" }],
  },
  {
    label: "Reports & Data",
    items: [
      { label: "Reports", path: "/reports", icon: BarChart3, requiredFeature: "reports", requiredPermission: "reports.view" },
      { label: "Import / Export", path: "/import-export", icon: Archive, requiredFeature: "import_export", requiredPermissionsAny: ["export.view", "import.view"] },
      { label: "Backup & Recovery", path: "/backup-recovery", icon: DatabaseBackup, requiredFeature: "backup_recovery", requiredPermissionsAny: ["backup.view", "backup.view_history", "backup.restore_request"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Settings", path: "/settings", icon: Settings, requiredFeature: "settings", requiredPermission: "settings.view" },
      { label: "Audit Logs", path: "/audit-logs", icon: History, requiredFeature: "audit_logs", requiredPermission: "audit_logs.view" },
    ],
  },
];

export const canAccessNavItem = (user: CurrentUser | null, item: NavItem) =>
  hasPermission(user, item.requiredPermission) &&
  hasAnyPermission(user, item.requiredPermissionsAny) &&
  hasFeature(user, item.requiredFeature);

export const getVisibleNavigation = (user: CurrentUser | null): NavGroup[] =>
  navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessNavItem(user, item)),
    }))
    .filter((group) => group.items.length > 0);
