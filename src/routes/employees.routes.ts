import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requireAnyPermissionOrError, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as employeesController from "../modules/employees/employees.controller";
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
  "/:id/payslips",
  requireFeature("payslips"),
  requirePermission("payslips.view"),
  payslipsController.listEmployeePayslips,
);
employeesRoutes.get(
  "/:id/offboarding",
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
