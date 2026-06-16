import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requireAnyPermissionOrError, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as employeesController from "../modules/employees/employees.controller";
import * as attendanceCalendarController from "../modules/attendance/attendance-calendar.controller";
import * as employeeExitController from "../modules/employee-lifecycle/employee-exit.controller";
import * as structureController from "../modules/employee-structure/employee-structure.controller";
import * as structureChangeController from "../modules/employee-structure/employee-structure-change.controller";
import * as contractsController from "../modules/employee-contracts/employee-contracts.controller";
import * as offboardingController from "../modules/offboarding/offboarding.controller";
import * as payslipsController from "../modules/payslips/payslips.controller";
import type { AppContext } from "../types/api.types";

const employeesRoutes = new Hono<AppContext>();

employeesRoutes.use("*", authMiddleware);
employeesRoutes.use("*", requireFeature("employee_management"));

employeesRoutes.get("/", requirePermission("employees.view"), employeesController.listEmployees);
employeesRoutes.post("/", requirePermission("employees.create"), employeesController.createEmployee);
employeesRoutes.get(
  "/login-link-candidates",
  requireAnyPermissionOrError(["employees.login.link", "users.edit"], {
    code: "EMPLOYEE_LOGIN_PERMISSION_DENIED",
    message: "You do not have permission to link existing users to employees.",
  }),
  employeesController.listEmployeeLoginLinkCandidates,
);
employeesRoutes.get(
  "/structure-change-requests",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError([
    "employees.structureRequests.view",
    "employees.structureRequests.create",
    "employees.structureRequests.review",
    "employees.structureRequests.finalApprove",
    "employees.structureRequests.apply",
    "employees.structureRequests.audit.view",
    "approvals.operationOwner.view",
    "approvals.operationOwner.approve",
    "approvals.operationFinal.view",
    "approvals.operationFinal.approve",
    "approvals.operationExecutor.view",
    "approvals.operationExecutor.apply",
    "employees.structure.view",
  ], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to view employee transfer or structure change requests.",
  }),
  structureChangeController.listEmployeeStructureChangeRequests,
);
employeesRoutes.post(
  "/structure-change-requests",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError(["employees.structureRequests.create", "employees.structureRequests.createForOthers"], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to create employee transfer or structure change requests.",
  }),
  requireReason(),
  structureChangeController.createEmployeeStructureChangeRequest,
);
employeesRoutes.get(
  "/structure-change-requests/:requestId",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError([
    "employees.structureRequests.view",
    "employees.structureRequests.create",
    "employees.structureRequests.review",
    "employees.structureRequests.finalApprove",
    "employees.structureRequests.apply",
    "employees.structureRequests.audit.view",
    "approvals.operationOwner.view",
    "approvals.operationOwner.approve",
    "approvals.operationFinal.view",
    "approvals.operationFinal.approve",
    "approvals.operationExecutor.view",
    "approvals.operationExecutor.apply",
    "employees.structure.view",
  ], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to view this employee transfer or structure change request.",
  }),
  structureChangeController.getEmployeeStructureChangeRequest,
);
employeesRoutes.post(
  "/structure-change-requests/:requestId/submit",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError(["employees.structureRequests.create", "employees.structureRequests.createForOthers"], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to submit employee transfer or structure change requests.",
  }),
  structureChangeController.submitEmployeeStructureChangeRequest,
);
employeesRoutes.post(
  "/structure-change-requests/:requestId/approve",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError([
    "employees.structureRequests.review",
    "employees.structureRequests.finalApprove",
    "approvals.operationOwner.approve",
    "approvals.operationFinal.approve",
    "approvals.department.approve",
    "approvals.hrFinal.approve",
  ], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to approve employee transfer or structure change requests.",
  }),
  requireReason(),
  structureChangeController.approveEmployeeStructureChangeRequest,
);
employeesRoutes.post(
  "/structure-change-requests/:requestId/reject",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError([
    "employees.structureRequests.reject",
    "approvals.operationOwner.reject",
    "approvals.operationFinal.reject",
    "approvals.department.reject",
    "approvals.hrFinal.reject",
  ], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to reject employee transfer or structure change requests.",
  }),
  requireReason(),
  structureChangeController.rejectEmployeeStructureChangeRequest,
);
employeesRoutes.post(
  "/structure-change-requests/:requestId/cancel",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError(["employees.structureRequests.cancel", "employees.structureRequests.cancelAny", "approvals.requests.cancel", "approvals.requests.cancelAny"], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to cancel employee transfer or structure change requests.",
  }),
  requireReason(),
  structureChangeController.cancelEmployeeStructureChangeRequest,
);
employeesRoutes.post(
  "/structure-change-requests/:requestId/apply",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError(["employees.structureRequests.apply", "approvals.operationExecutor.apply", "employees.structure.manage"], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to apply employee transfer or structure changes.",
  }),
  requireReason(),
  structureChangeController.applyEmployeeStructureChangeRequest,
);
employeesRoutes.get(
  "/structure-change-requests/:requestId/timeline",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError([
    "employees.structureRequests.view",
    "employees.structureRequests.audit.view",
    "employees.structureRequests.review",
    "employees.structureRequests.finalApprove",
    "employees.structureRequests.apply",
    "approvals.operationOwner.view",
    "approvals.operationOwner.approve",
    "approvals.operationFinal.view",
    "approvals.operationFinal.approve",
    "approvals.operationExecutor.view",
    "approvals.operationExecutor.apply",
    "approvals.requests.audit.view",
    "employees.structure.view",
  ], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to view this employee transfer or structure change timeline.",
  }),
  structureChangeController.employeeStructureChangeTimeline,
);
employeesRoutes.get(
  "/structure-change-requests/:requestId/items",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError([
    "employees.structureRequests.view",
    "employees.structureRequests.audit.view",
    "employees.structureRequests.review",
    "employees.structureRequests.finalApprove",
    "employees.structureRequests.apply",
    "approvals.operationOwner.view",
    "approvals.operationOwner.approve",
    "approvals.operationFinal.view",
    "approvals.operationFinal.approve",
    "approvals.operationExecutor.view",
    "approvals.operationExecutor.apply",
    "employees.structure.view",
  ], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to view this employee transfer or structure change request.",
  }),
  structureChangeController.employeeStructureChangeItems,
);
employeesRoutes.get(
  "/structure-change-requests/:requestId/audit",
  requireFeature("employee_structure_changes"),
  requireAnyPermissionOrError([
    "employees.structureRequests.view",
    "employees.structureRequests.audit.view",
    "approvals.operationOwner.view",
    "approvals.operationFinal.view",
    "approvals.operationExecutor.view",
    "approvals.requests.audit.view",
    "employees.structure.view",
  ], {
    code: "EMPLOYEE_STRUCTURE_REQUEST_PERMISSION_DENIED",
    message: "You do not have permission to view this employee transfer or structure change audit.",
  }),
  structureChangeController.employeeStructureChangeAudit,
);
const employeeLifecycleViewPermissions = [
  "employeeLifecycle.resignations.view",
  "employeeLifecycle.resignations.viewOwn",
  "employeeLifecycle.resignations.create",
  "employeeLifecycle.resignations.review",
  "employeeLifecycle.resignations.finalApprove",
  "employeeLifecycle.resignations.apply",
  "employeeLifecycle.offboarding.view",
  "employeeLifecycle.offboarding.viewOwn",
  "employeeLifecycle.offboarding.create",
  "employeeLifecycle.offboarding.review",
  "employeeLifecycle.offboarding.finalApprove",
  "employeeLifecycle.offboarding.apply",
  "employeeLifecycle.offboarding.complete",
  "employeeLifecycle.offboarding.tasks.view",
  "employeeLifecycle.offboarding.tasks.complete",
  "employeeLifecycle.offboarding.tasks.waive",
  "employeeLifecycle.exitRequests.viewAll",
  "employeeLifecycle.audit.view",
  "approvals.operationOwner.view",
  "approvals.operationOwner.approve",
  "approvals.operationFinal.view",
  "approvals.operationFinal.approve",
  "approvals.operationExecutor.view",
  "approvals.operationExecutor.apply",
  "approvals.requests.audit.view",
  "employees.view",
];

employeesRoutes.get(
  "/exit-requests",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError(employeeLifecycleViewPermissions, {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to view resignation or offboarding requests.",
  }),
  employeeExitController.listEmployeeExitRequests,
);
employeesRoutes.post(
  "/exit-requests",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError([
    "employeeLifecycle.resignations.create",
    "employeeLifecycle.resignations.createForOthers",
    "employeeLifecycle.offboarding.create",
    "employeeLifecycle.offboarding.createForOthers",
  ], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to create resignation or offboarding requests.",
  }),
  requireReason(),
  employeeExitController.createEmployeeExitRequest,
);
employeesRoutes.get(
  "/exit-requests/:requestId",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError(employeeLifecycleViewPermissions, {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to view this resignation or offboarding request.",
  }),
  employeeExitController.getEmployeeExitRequest,
);
employeesRoutes.post(
  "/exit-requests/:requestId/submit",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError([
    "employeeLifecycle.resignations.create",
    "employeeLifecycle.resignations.createForOthers",
    "employeeLifecycle.offboarding.create",
    "employeeLifecycle.offboarding.createForOthers",
  ], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to submit resignation or offboarding requests.",
  }),
  employeeExitController.submitEmployeeExitRequest,
);
employeesRoutes.post(
  "/exit-requests/:requestId/approve",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError([
    "employeeLifecycle.resignations.review",
    "employeeLifecycle.resignations.finalApprove",
    "employeeLifecycle.offboarding.review",
    "employeeLifecycle.offboarding.finalApprove",
    "approvals.operationOwner.approve",
    "approvals.operationFinal.approve",
    "approvals.department.approve",
  ], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to approve resignation or offboarding requests.",
  }),
  requireReason(),
  employeeExitController.approveEmployeeExitRequest,
);
employeesRoutes.post(
  "/exit-requests/:requestId/reject",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError([
    "employeeLifecycle.resignations.reject",
    "employeeLifecycle.offboarding.reject",
    "approvals.operationOwner.reject",
    "approvals.operationFinal.reject",
    "approvals.department.reject",
  ], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to reject resignation or offboarding requests.",
  }),
  requireReason(),
  employeeExitController.rejectEmployeeExitRequest,
);
employeesRoutes.post(
  "/exit-requests/:requestId/cancel",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError([
    "employeeLifecycle.resignations.cancel",
    "employeeLifecycle.resignations.cancelAny",
    "employeeLifecycle.offboarding.cancel",
    "employeeLifecycle.offboarding.cancelAny",
    "approvals.requests.cancel",
    "approvals.requests.cancelAny",
  ], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to cancel or withdraw resignation or offboarding requests.",
  }),
  requireReason(),
  employeeExitController.cancelEmployeeExitRequest,
);
employeesRoutes.post(
  "/exit-requests/:requestId/apply",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError([
    "employeeLifecycle.resignations.apply",
    "employeeLifecycle.offboarding.apply",
    "employeeLifecycle.offboarding.manage",
    "approvals.operationExecutor.apply",
  ], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to apply resignation or offboarding requests.",
  }),
  requireReason(),
  employeeExitController.applyEmployeeExitRequest,
);
employeesRoutes.post(
  "/exit-requests/:requestId/complete",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError([
    "employeeLifecycle.offboarding.complete",
    "employeeLifecycle.offboarding.apply",
    "employeeLifecycle.offboarding.manage",
    "approvals.operationExecutor.apply",
  ], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to complete offboarding.",
  }),
  requireReason(),
  employeeExitController.completeEmployeeExitRequest,
);
employeesRoutes.get(
  "/exit-requests/:requestId/timeline",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError(employeeLifecycleViewPermissions, {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to view this resignation or offboarding timeline.",
  }),
  employeeExitController.employeeExitTimeline,
);
employeesRoutes.get(
  "/exit-requests/:requestId/tasks",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError(employeeLifecycleViewPermissions, {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to view offboarding tasks.",
  }),
  employeeExitController.employeeExitTasks,
);
employeesRoutes.post(
  "/exit-requests/:requestId/tasks/:taskId/complete",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError(["employeeLifecycle.offboarding.tasks.complete", "employeeLifecycle.tasks.manage", "employeeLifecycle.offboarding.manage"], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to complete offboarding tasks.",
  }),
  employeeExitController.completeEmployeeExitTask,
);
employeesRoutes.post(
  "/exit-requests/:requestId/tasks/:taskId/waive",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError(["employeeLifecycle.offboarding.tasks.waive", "employeeLifecycle.tasks.manage", "employeeLifecycle.offboarding.manage"], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to waive offboarding tasks.",
  }),
  requireReason(),
  employeeExitController.waiveEmployeeExitTask,
);
employeesRoutes.get(
  "/exit-requests/:requestId/audit",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError([...employeeLifecycleViewPermissions, "employeeLifecycle.audit.view"], {
    code: "EMPLOYEE_LIFECYCLE_PERMISSION_DENIED",
    message: "You do not have permission to view this resignation or offboarding audit.",
  }),
  employeeExitController.employeeExitAudit,
);
employeesRoutes.get(
  "/:employeeId/attendance-calendar",
  requireFeature("attendance"),
  requireAnyPermissionOrError(["attendance.calendar.view", "attendance.calendar.viewTeam", "attendance.calendar.viewAll", "attendance.view", "attendance.reports.view", "employees.view"], {
    code: "EMPLOYEE_ATTENDANCE_CALENDAR_PERMISSION_DENIED",
    message: "You do not have permission to view this employee attendance calendar.",
  }),
  attendanceCalendarController.employeeAttendanceCalendar,
);
employeesRoutes.get(
  "/:id/profile-photo",
  requireAnyPermissionOrError(["employees.profilePhoto.view", "employees.view", "employees.profile.view"], {
    code: "EMPLOYEE_PROFILE_PHOTO_PERMISSION_DENIED",
    message: "You do not have permission to view employee profile pictures.",
  }),
  employeesController.getEmployeeProfilePhoto,
);
employeesRoutes.post(
  "/:id/profile-photo",
  requireAnyPermissionOrError(["employees.profilePhoto.upload", "employees.profilePhoto.manage", "employees.edit", "employees.manage"], {
    code: "EMPLOYEE_PROFILE_PHOTO_PERMISSION_DENIED",
    message: "You do not have permission to update employee profile pictures.",
  }),
  employeesController.updateEmployeeProfilePhoto,
);
employeesRoutes.delete(
  "/:id/profile-photo",
  requireAnyPermissionOrError(["employees.profilePhoto.manage", "employees.edit", "employees.manage"], {
    code: "EMPLOYEE_PROFILE_PHOTO_PERMISSION_DENIED",
    message: "You do not have permission to remove employee profile pictures.",
  }),
  requireReason(),
  employeesController.removeEmployeeProfilePhoto,
);
employeesRoutes.get(
  "/:id/payslips",
  requireFeature("payslips"),
  requirePermission("payslips.view"),
  payslipsController.listEmployeePayslips,
);
employeesRoutes.get(
  "/:id/offboarding",
  requireFeature("resignation_offboarding"),
  requireAnyPermissionOrError(["employees.offboarding.view", "offboarding.view", "employees.view"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to view employee offboarding.",
  }),
  offboardingController.listEmployeeOffboarding,
);
employeesRoutes.get(
  "/:id/contracts",
  requireAnyPermissionOrError(["employees.contracts.view", "contracts.view", "employees.view"], {
    code: "CONTRACT_PERMISSION_DENIED",
    message: "You do not have permission to view employee contracts.",
  }),
  contractsController.listEmployeeContracts,
);
employeesRoutes.post(
  "/:id/contracts",
  requireAnyPermissionOrError(["employees.contracts.manage", "contracts.manage", "employees.edit"], {
    code: "CONTRACT_PERMISSION_DENIED",
    message: "You do not have permission to manage employee contracts.",
  }),
  contractsController.createContract,
);
employeesRoutes.get(
  "/:id/contracts/:contractId",
  requireAnyPermissionOrError(["employees.contracts.view", "contracts.view", "employees.view"], {
    code: "CONTRACT_PERMISSION_DENIED",
    message: "You do not have permission to view employee contracts.",
  }),
  contractsController.getContract,
);
employeesRoutes.patch(
  "/:id/contracts/:contractId",
  requireAnyPermissionOrError(["employees.contracts.manage", "contracts.manage", "employees.edit"], {
    code: "CONTRACT_PERMISSION_DENIED",
    message: "You do not have permission to manage employee contracts.",
  }),
  contractsController.updateContract,
);
employeesRoutes.post(
  "/:id/contracts/:contractId/renew",
  requireAnyPermissionOrError(["employees.contracts.manage", "contracts.manage", "employees.edit"], {
    code: "CONTRACT_PERMISSION_DENIED",
    message: "You do not have permission to renew employee contracts.",
  }),
  contractsController.renewContract,
);
employeesRoutes.post(
  "/:id/contracts/:contractId/archive",
  requireAnyPermissionOrError(["employees.contracts.manage", "contracts.manage", "employees.edit"], {
    code: "CONTRACT_PERMISSION_DENIED",
    message: "You do not have permission to archive employee contracts.",
  }),
  contractsController.archiveContract,
);
employeesRoutes.get(
  "/:id/contracts/:contractId/history",
  requireAnyPermissionOrError(["employees.contracts.view", "contracts.view", "employees.view"], {
    code: "CONTRACT_PERMISSION_DENIED",
    message: "You do not have permission to view employee contract history.",
  }),
  contractsController.contractHistory,
);
employeesRoutes.post(
  "/:id/offboarding/start",
  requireAnyPermissionOrError(["employees.offboarding.manage", "offboarding.manage", "employees.edit"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to start employee offboarding.",
  }),
  offboardingController.startCase,
);
employeesRoutes.get(
  "/:id/offboarding/:caseId",
  requireAnyPermissionOrError(["employees.offboarding.view", "offboarding.view", "employees.view"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to view employee offboarding.",
  }),
  offboardingController.getCase,
);
employeesRoutes.patch(
  "/:id/offboarding/:caseId",
  requireAnyPermissionOrError(["employees.offboarding.manage", "offboarding.manage", "employees.edit"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to update employee offboarding.",
  }),
  offboardingController.updateCase,
);
employeesRoutes.post(
  "/:id/offboarding/:caseId/tasks/:taskId/complete",
  requireAnyPermissionOrError(["employees.offboarding.complete_task", "offboarding.complete_task", "employees.edit"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to complete offboarding tasks.",
  }),
  offboardingController.completeTask,
);
employeesRoutes.post(
  "/:id/offboarding/:caseId/tasks/:taskId/waive",
  requireAnyPermissionOrError(["employees.offboarding.complete_task", "offboarding.complete_task", "employees.edit"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to waive offboarding tasks.",
  }),
  offboardingController.waiveTask,
);
employeesRoutes.post(
  "/:id/offboarding/:caseId/cancel",
  requireAnyPermissionOrError(["employees.offboarding.manage", "offboarding.manage", "employees.edit"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to cancel offboarding.",
  }),
  offboardingController.cancelCase,
);
employeesRoutes.post(
  "/:id/offboarding/:caseId/prepare-final-settlement",
  requireAnyPermissionOrError(["employees.offboarding.final_settlement", "offboarding.final_settlement", "payroll.manage"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to prepare final settlement.",
  }),
  offboardingController.prepareFinalSettlement,
);
employeesRoutes.post(
  "/:id/offboarding/:caseId/mark-ready",
  requireAnyPermissionOrError(["employees.offboarding.manage", "offboarding.manage", "employees.edit"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to mark offboarding ready.",
  }),
  offboardingController.markReady,
);
employeesRoutes.post(
  "/:id/offboarding/:caseId/complete",
  requireAnyPermissionOrError(["employees.offboarding.manage", "offboarding.manage", "employees.edit"], {
    code: "OFFBOARDING_PERMISSION_DENIED",
    message: "You do not have permission to complete offboarding.",
  }),
  offboardingController.completeCase,
);
employeesRoutes.get(
  "/:id/profile",
  requireAnyPermissionOrError(["employees.view", "dashboard.view", "dashboard.view_outlet", "dashboard.view_company"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view Employee 360 profiles.",
  }),
  employeesController.getEmployeeProfile,
);
employeesRoutes.get(
  "/:id/profile/summary",
  requireAnyPermissionOrError(["employees.view", "dashboard.view", "dashboard.view_outlet", "dashboard.view_company"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view this employee profile.",
  }),
  employeesController.getEmployeeProfileSummary,
);
employeesRoutes.get(
  "/:id/profile/attendance",
  requireAnyPermissionOrError(["attendance.view", "attendance.reports.view", "dashboard.attendance.view"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view employee attendance.",
  }),
  employeesController.getEmployeeProfileAttendance,
);
employeesRoutes.get(
  "/:id/profile/leave",
  requireAnyPermissionOrError(["leave.view", "dashboard.leave.view"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view employee leave.",
  }),
  employeesController.getEmployeeProfileLeave,
);
employeesRoutes.get(
  "/:id/profile/long-leave",
  requireAnyPermissionOrError(["long_leave.view", "dashboard.long_leave.view"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view employee long leave.",
  }),
  employeesController.getEmployeeProfileLongLeave,
);
employeesRoutes.get(
  "/:id/profile/documents",
  requirePermission("documents.view"),
  employeesController.getEmployeeProfileDocuments,
);
employeesRoutes.get(
  "/:id/profile/contracts",
  requireAnyPermissionOrError(["employees.contracts.view", "contracts.view", "employees.view"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view employee contracts.",
  }),
  employeesController.getEmployeeProfileContracts,
);
employeesRoutes.get(
  "/:id/profile/assets",
  requireAnyPermissionOrError(["assets.view", "uniforms.view"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view employee assets or uniforms.",
  }),
  employeesController.getEmployeeProfileAssets,
);
employeesRoutes.get(
  "/:id/profile/payroll-readiness",
  requireAnyPermissionOrError(["payroll.view", "salary.view", "employees.salary.view", "dashboard.payroll_readiness.view"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view employee payroll readiness.",
  }),
  employeesController.getEmployeeProfilePayrollReadiness,
);
employeesRoutes.get(
  "/:id/profile/alerts",
  requireAnyPermissionOrError(["expiry_alerts.view", "expiry_alerts.view_own"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view employee alerts.",
  }),
  employeesController.getEmployeeProfileAlerts,
);
employeesRoutes.get(
  "/:id/profile/timeline",
  requireAnyPermissionOrError(["employees.view", "audit_logs.view"], {
    code: "EMPLOYEE_PROFILE_PERMISSION_DENIED",
    message: "You do not have permission to view employee timeline.",
  }),
  employeesController.getEmployeeProfileTimeline,
);
employeesRoutes.get(
  "/:id/login",
  requireAnyPermissionOrError(["employees.login.view", "employees.view", "users.view"], {
    code: "EMPLOYEE_LOGIN_PERMISSION_DENIED",
    message: "You do not have permission to view employee login access.",
  }),
  employeesController.getEmployeeLogin,
);
employeesRoutes.post(
  "/:id/login",
  requireAnyPermissionOrError(["employees.login.create", "users.create"], {
    code: "EMPLOYEE_LOGIN_PERMISSION_DENIED",
    message: "You do not have permission to create login access for employees.",
  }),
  employeesController.createEmployeeLogin,
);
employeesRoutes.patch(
  "/:id/login",
  requireAnyPermissionOrError(["employees.login.link", "users.edit"], {
    code: "EMPLOYEE_LOGIN_PERMISSION_DENIED",
    message: "You do not have permission to update employee login access.",
  }),
  employeesController.updateEmployeeLogin,
);
employeesRoutes.post(
  "/:id/login/disable",
  requireAnyPermissionOrError(["employees.login.revoke", "users.disable", "users.edit"], {
    code: "EMPLOYEE_LOGIN_PERMISSION_DENIED",
    message: "You do not have permission to disable employee login access.",
  }),
  employeesController.disableEmployeeLogin,
);
employeesRoutes.post(
  "/:id/login/enable",
  requireAnyPermissionOrError(["employees.login.link", "users.enable", "users.edit"], {
    code: "EMPLOYEE_LOGIN_PERMISSION_DENIED",
    message: "You do not have permission to enable employee login access.",
  }),
  employeesController.enableEmployeeLogin,
);
employeesRoutes.post(
  "/:id/login/reset-password",
  requireAnyPermissionOrError(["employees.login.revoke", "users.reset_password", "users.edit"], {
    code: "EMPLOYEE_LOGIN_PERMISSION_DENIED",
    message: "You do not have permission to reset employee login passwords.",
  }),
  employeesController.resetEmployeeLoginPassword,
);
employeesRoutes.post(
  "/:id/login/link-existing",
  requireAnyPermissionOrError(["employees.login.link", "users.edit"], {
    code: "EMPLOYEE_LOGIN_PERMISSION_DENIED",
    message: "You do not have permission to link existing users to employees.",
  }),
  employeesController.linkExistingUserToEmployee,
);
employeesRoutes.get(
  "/:id/structure",
  requireAnyPermissionOrError(["employees.structure.view", "employees.view"], {
    code: "EMPLOYEE_STRUCTURE_PERMISSION_DENIED",
    message: "You do not have permission to view employee structure.",
  }),
  structureController.getEmployeeStructure,
);
employeesRoutes.patch(
  "/:id/structure",
  requireAnyPermissionOrError(["employees.structure.manage"], {
    code: "EMPLOYEE_STRUCTURE_PERMISSION_DENIED",
    message: "You do not have permission to manage employee structure.",
  }),
  structureController.updateEmployeeStructure,
);
employeesRoutes.get(
  "/:id/structure-history",
  requireAnyPermissionOrError(["employees.structure.view", "employees.view"], {
    code: "EMPLOYEE_STRUCTURE_PERMISSION_DENIED",
    message: "You do not have permission to view employee structure history.",
  }),
  structureController.listEmployeeStructureHistory,
);
employeesRoutes.post(
  "/:id/apply-level-role-template",
  requireAnyPermissionOrError(["employees.structure.manage"], {
    code: "EMPLOYEE_STRUCTURE_PERMISSION_DENIED",
    message: "You do not have permission to apply employee structure templates.",
  }),
  requireAnyPermissionOrError(["users.edit", "roles.edit"], {
    code: "EMPLOYEE_STRUCTURE_PERMISSION_DENIED",
    message: "You do not have permission to assign user roles.",
  }),
  structureController.applyLevelRoleTemplate,
);
employeesRoutes.get("/:id", requirePermission("employees.view"), employeesController.getEmployee);
employeesRoutes.patch("/:id", requirePermission("employees.edit"), employeesController.updateEmployee);
employeesRoutes.post(
  "/:id/archive",
  requirePermission("employees.archive"),
  requireReason(),
  employeesController.archiveEmployee,
);
employeesRoutes.post(
  "/:id/restore",
  requirePermission("employees.restore"),
  requireReason(),
  employeesController.restoreEmployee,
);
employeesRoutes.post(
  "/:id/status",
  requirePermission("employees.manage_status"),
  requireReason(),
  employeesController.changeStatus,
);
employeesRoutes.post(
  "/:id/status-change",
  requirePermission("employees.manage_status"),
  requireReason(),
  employeesController.changeStatus,
);
employeesRoutes.post(
  "/:id/outlet-assignment",
  requirePermission("employees.manage_outlet_assignment"),
  requireReason(),
  employeesController.assignOutlet,
);
employeesRoutes.post(
  "/:id/job-change",
  requireAnyPermissionOrError(
    ["employees.edit", "employees.job_change.manage", "employees.manage"],
    {
      code: "JOB_CHANGE_PERMISSION_DENIED",
      message: "You do not have permission to record employee job changes.",
    },
  ),
  employeesController.changeJob,
);
employeesRoutes.get(
  "/:id/job-history",
  requireAnyPermission(["employees.view", "employees.job_history.view"]),
  employeesController.listJobHistory,
);
employeesRoutes.get(
  "/:id/status-history",
  requirePermission("employees.view"),
  employeesController.listStatusHistory,
);
employeesRoutes.get(
  "/:id/salary-history",
  requireAnyPermissionOrError(
    ["payroll.view", "employees.salary.view", "employees.view_salary", "salary.view", "salary.history"],
    {
      code: "SALARY_PERMISSION_DENIED",
      message: "You do not have permission to view employee salary history.",
    },
  ),
  employeesController.listSalaryHistory,
);
employeesRoutes.post(
  "/:id/salary-history",
  requireAnyPermissionOrError(
    ["payroll.manage", "employees.salary.manage", "employees.edit_salary", "salary.create", "salary.edit"],
    {
      code: "SALARY_PERMISSION_DENIED",
      message: "You do not have permission to update employee salary history.",
    },
  ),
  employeesController.addSalaryHistory,
);
employeesRoutes.get(
  "/:id/compensation-summary",
  requireAnyPermissionOrError(
    ["employees.compensation.view", "payroll.view", "employees.salary.view", "employees.view_salary", "salary.view", "salary.history"],
    {
      code: "COMPENSATION_PERMISSION_DENIED",
      message: "You do not have permission to view employee compensation.",
    },
  ),
  employeesController.getCompensationSummary,
);
employeesRoutes.get(
  "/:id/compensation-components",
  requireAnyPermissionOrError(
    ["employees.compensation.view", "payroll.view", "employees.salary.view", "employees.view_salary", "salary.view", "salary.history"],
    {
      code: "COMPENSATION_PERMISSION_DENIED",
      message: "You do not have permission to view employee compensation.",
    },
  ),
  employeesController.listCompensationComponents,
);
employeesRoutes.post(
  "/:id/compensation-components",
  requireAnyPermissionOrError(
    ["employees.compensation.manage", "payroll.manage", "employees.salary.manage", "employees.edit_salary", "salary.create", "salary.edit"],
    {
      code: "COMPENSATION_PERMISSION_DENIED",
      message: "You do not have permission to manage employee compensation.",
    },
  ),
  employeesController.createCompensationComponent,
);
employeesRoutes.patch(
  "/:id/compensation-components/:componentId",
  requireAnyPermissionOrError(
    ["employees.compensation.manage", "payroll.manage", "employees.salary.manage", "employees.edit_salary", "salary.create", "salary.edit"],
    {
      code: "COMPENSATION_PERMISSION_DENIED",
      message: "You do not have permission to manage employee compensation.",
    },
  ),
  employeesController.changeCompensationComponent,
);
employeesRoutes.post(
  "/:id/compensation-components/:componentId/end",
  requireAnyPermissionOrError(
    ["employees.compensation.manage", "payroll.manage", "employees.salary.manage", "employees.edit_salary", "salary.create", "salary.edit"],
    {
      code: "COMPENSATION_PERMISSION_DENIED",
      message: "You do not have permission to manage employee compensation.",
    },
  ),
  employeesController.endCompensationComponent,
);
employeesRoutes.get(
  "/:id/documents",
  requireFeature("documents"),
  requirePermission("documents.view"),
  employeesController.listDocuments,
);
employeesRoutes.post(
  "/:id/documents",
  requireFeature("documents"),
  requirePermission("documents.upload"),
  employeesController.addDocument,
);
employeesRoutes.get(
  "/:id/documents/:documentId",
  requireFeature("documents"),
  requirePermission("documents.view"),
  employeesController.getDocument,
);
employeesRoutes.patch(
  "/:id/documents/:documentId",
  requireFeature("documents"),
  requirePermission("documents.edit"),
  employeesController.updateDocument,
);
employeesRoutes.post(
  "/:id/documents/:documentId/replace",
  requireFeature("documents"),
  requirePermission("documents.upload"),
  employeesController.replaceDocument,
);
employeesRoutes.post(
  "/:id/documents/:documentId/archive",
  requireFeature("documents"),
  requirePermission("documents.edit"),
  requireReason(),
  employeesController.archiveDocument,
);
employeesRoutes.get(
  "/:id/documents/:documentId/history",
  requireFeature("documents"),
  requirePermission("documents.view"),
  employeesController.documentHistory,
);
employeesRoutes.get("/:id/notes", requirePermission("employees.view"), employeesController.listNotes);
employeesRoutes.post("/:id/notes", requirePermission("employees.edit"), employeesController.addNote);
employeesRoutes.get(
  "/:id/audit-log",
  requirePermission("audit_logs.view"),
  employeesController.listAuditLog,
);

export { employeesRoutes };
