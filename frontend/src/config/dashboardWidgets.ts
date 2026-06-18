import type { PermissionKey } from "@/types/auth";
import type { AttendanceSubFeatureKey, PayrollSubFeatureKey } from "@/lib/subfeatures";

export type DashboardType = "ADMIN_COMMAND_CENTER" | "SELF_SERVICE_DASHBOARD";
export type DashboardWidgetSize = "small" | "medium" | "wide";

export interface DashboardWidgetDefinition {
  id: string;
  dashboardType: DashboardType;
  label: string;
  description: string;
  defaultVisible: boolean;
  defaultOrder: number;
  defaultSize?: DashboardWidgetSize;
  moduleCode?: string;
  requiredFeaturesAll?: string[];
  requiredPermission?: PermissionKey;
  requiredPermissionsAny?: PermissionKey[];
  requiredPayrollSubFeature?: PayrollSubFeatureKey;
  requiredPayrollSubFeaturesAll?: PayrollSubFeatureKey[];
  requiredAttendanceSubFeature?: AttendanceSubFeatureKey;
  requiredAttendanceSubFeaturesAll?: AttendanceSubFeatureKey[];
  requiresLinkedEmployee?: boolean;
  sensitive?: boolean;
}

export const adminCommandCenterWidgetDefinitions: DashboardWidgetDefinition[] = [
  {
    id: "people-snapshot",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "People Snapshot",
    description: "Employee population and setup health.",
    defaultVisible: true,
    defaultOrder: 10,
    moduleCode: "employees",
    requiredPermissionsAny: ["employees.view", "employees.list", "dashboard.view"],
  },
  {
    id: "attendance-pulse",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Attendance Pulse",
    description: "Today attendance status and correction attention.",
    defaultVisible: true,
    defaultOrder: 20,
    moduleCode: "attendance",
    requiredPermissionsAny: ["attendance.view", "attendance.calendar.view", "attendance.reports.view", "dashboard.attendance.view"],
  },
  {
    id: "approval-queue",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Approval Queue",
    description: "Pending approval work by module.",
    defaultVisible: true,
    defaultOrder: 30,
    defaultSize: "wide",
    moduleCode: "approvals",
    requiredPermissionsAny: ["approvals.view", "approvals.requests.view", "dashboard.view"],
  },
  {
    id: "payroll-readiness",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Payroll Readiness",
    description: "Attendance and adjustment blockers for payroll review.",
    defaultVisible: true,
    defaultOrder: 40,
    moduleCode: "payroll",
    requiredPermissionsAny: ["payroll.view", "dashboard.payroll_readiness.view", "payroll.attendanceReview.view"],
    sensitive: true,
  },
  {
    id: "department-health",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Department Health",
    description: "Scoped team and department attention summary.",
    defaultVisible: true,
    defaultOrder: 50,
    requiredFeaturesAll: ["employees", "attendance"],
    requiredPermissionsAny: ["departments.dashboard.view", "departments.dashboard.viewTeam", "attendance.teamCalendar.view", "employees.team.view"],
  },
  {
    id: "document-expiry",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Document Expiry",
    description: "Document and KYC attention counts.",
    defaultVisible: true,
    defaultOrder: 60,
    moduleCode: "documents_kyc",
    requiredPermissionsAny: ["documents.view", "documents.expiry.view", "expiry_alerts.view"],
    sensitive: true,
  },
  {
    id: "roster-coverage",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Roster Coverage",
    description: "Roster staffing and change request attention.",
    defaultVisible: true,
    defaultOrder: 70,
    moduleCode: "roster",
    requiredPermissionsAny: ["rosters.view", "roster.view", "rosters.weeklyMatrix.view"],
  },
  {
    id: "employee-attention",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Employee Attention",
    description: "Employee setup and request categories needing review.",
    defaultVisible: true,
    defaultOrder: 80,
    moduleCode: "employees",
    requiredPermissionsAny: ["employees.view", "employees.list", "dashboard.view"],
  },
  {
    id: "lifecycle",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Lifecycle / Offboarding",
    description: "Notice period and offboarding task status.",
    defaultVisible: true,
    defaultOrder: 90,
    moduleCode: "resignation_offboarding",
    requiredPermissionsAny: ["offboarding.view", "employee_lifecycle.view", "resignations.view"],
    sensitive: true,
  },
  {
    id: "disciplinary-follow-up",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Disciplinary Follow-up",
    description: "Disciplinary reviews, acknowledgements, and follow-ups.",
    defaultVisible: true,
    defaultOrder: 100,
    moduleCode: "disciplinary_actions",
    requiredPermissionsAny: ["discipline.view", "disciplinary_actions.view", "discipline.manage"],
    sensitive: true,
  },
  {
    id: "operation-ownership-health",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Operation Ownership Health",
    description: "Responsibility matrix setup health.",
    defaultVisible: true,
    defaultOrder: 110,
    moduleCode: "operation_ownership",
    requiredPermissionsAny: ["operation_ownership.view", "operation_ownership.manage", "settings.view"],
  },
  {
    id: "recent-activity",
    dashboardType: "ADMIN_COMMAND_CENTER",
    label: "Recent Activity",
    description: "Safe, scoped recent activity summary.",
    defaultVisible: true,
    defaultOrder: 120,
    moduleCode: "audit",
    requiredPermissionsAny: ["audit.view", "dashboard.view"],
  },
];

export const selfServiceWidgetDefinitions: DashboardWidgetDefinition[] = [
  {
    id: "my-attendance-today",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Attendance Today",
    description: "Today's attendance status and punch warnings.",
    defaultVisible: true,
    defaultOrder: 10,
    moduleCode: "attendance",
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.attendance.view", "self.attendance.calendar.view", "attendance.self.view"],
  },
  {
    id: "my-attendance-calendar-preview",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Attendance Calendar Preview",
    description: "Current month attendance/payroll period preview.",
    defaultVisible: true,
    defaultOrder: 20,
    moduleCode: "attendance",
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.attendance.view", "self.attendance.calendar.view", "attendance.self.view"],
  },
  {
    id: "my-leave-balance",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Leave Balance",
    description: "Leave balances and pending leave requests.",
    defaultVisible: true,
    defaultOrder: 30,
    moduleCode: "leave",
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.leave.view", "leave.self.view", "leave.view_own"],
  },
  {
    id: "my-upcoming-roster",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Upcoming Roster",
    description: "Upcoming shifts and roster requests.",
    defaultVisible: true,
    defaultOrder: 40,
    moduleCode: "roster",
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.roster.view", "rosters.self.view", "roster.view_own"],
  },
  {
    id: "my-pending-requests",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Pending Requests",
    description: "Own requests across enabled modules.",
    defaultVisible: true,
    defaultOrder: 50,
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.requests.view", "self.dashboard.view"],
  },
  {
    id: "my-documents-kyc",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Documents / KYC",
    description: "Own document and KYC status.",
    defaultVisible: true,
    defaultOrder: 60,
    moduleCode: "documents_kyc",
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.documents.view", "documents.view_own", "kyc.self.view"],
    sensitive: true,
  },
  {
    id: "my-payslips",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Payslips",
    description: "Own payslip availability and payroll period summary.",
    defaultVisible: true,
    defaultOrder: 70,
    requiredFeaturesAll: ["payroll", "payslips"],
    requiredPayrollSubFeature: "payslips_enabled",
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.payslips.view", "payslips.view_own", "payroll.self.view"],
    sensitive: true,
  },
  {
    id: "my-approvals",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Approvals",
    description: "Approval work assigned or eligible for you.",
    defaultVisible: true,
    defaultOrder: 80,
    moduleCode: "approvals",
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["approvals.view", "approvals.requests.view", "approvals.department.approve", "department.approvals.view"],
  },
  {
    id: "my-offboarding-status",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Offboarding Status",
    description: "Own resignation/offboarding status when applicable.",
    defaultVisible: true,
    defaultOrder: 90,
    moduleCode: "resignation_offboarding",
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.offboarding.view", "offboarding.view_own", "resignations.view_own"],
    sensitive: true,
  },
  {
    id: "my-acknowledgements",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "My Acknowledgements",
    description: "Own acknowledgement tasks and receipt status.",
    defaultVisible: true,
    defaultOrder: 100,
    moduleCode: "disciplinary_actions",
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.discipline.view", "discipline.acknowledge", "disciplinary_actions.acknowledge"],
    sensitive: true,
  },
  {
    id: "my-recent-activity",
    dashboardType: "SELF_SERVICE_DASHBOARD",
    label: "Recent Self-Service Activity",
    description: "Own recent self-service activity.",
    defaultVisible: true,
    defaultOrder: 110,
    requiresLinkedEmployee: true,
    requiredPermissionsAny: ["self.dashboard.view", "self.requests.view"],
  },
];

export const dashboardWidgetDefinitions = [
  ...adminCommandCenterWidgetDefinitions,
  ...selfServiceWidgetDefinitions,
];
