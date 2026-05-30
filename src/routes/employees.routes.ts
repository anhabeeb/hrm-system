import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as employeesController from "../modules/employees/employees.controller";
import type { AppContext } from "../types/api.types";

const employeesRoutes = new Hono<AppContext>();

employeesRoutes.use("*", authMiddleware);
employeesRoutes.use("*", requireFeature("employee_management"));

employeesRoutes.get("/", requirePermission("employees.view"), employeesController.listEmployees);
employeesRoutes.post("/", requirePermission("employees.create"), employeesController.createEmployee);
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
  "/:id/outlet-assignment",
  requirePermission("employees.manage_outlet_assignment"),
  requireReason(),
  employeesController.assignOutlet,
);
employeesRoutes.post(
  "/:id/job-change",
  requirePermission("employees.edit"),
  requireReason(),
  employeesController.changeJob,
);
employeesRoutes.get(
  "/:id/job-history",
  requirePermission("employees.view"),
  employeesController.listJobHistory,
);
employeesRoutes.get(
  "/:id/status-history",
  requirePermission("employees.view"),
  employeesController.listStatusHistory,
);
employeesRoutes.get(
  "/:id/salary-history",
  requirePermission("salary.view"),
  employeesController.listSalaryHistory,
);
employeesRoutes.post(
  "/:id/salary-history",
  requireAnyPermission(["salary.create", "salary.edit"]),
  requireReason(),
  employeesController.addSalaryHistory,
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
employeesRoutes.get("/:id/notes", requirePermission("employees.view"), employeesController.listNotes);
employeesRoutes.post("/:id/notes", requirePermission("employees.edit"), employeesController.addNote);
employeesRoutes.get(
  "/:id/audit-log",
  requirePermission("audit_logs.view"),
  employeesController.listAuditLog,
);

export { employeesRoutes };
