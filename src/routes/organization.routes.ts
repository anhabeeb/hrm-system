import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermissionOrError } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as departmentsController from "../modules/departments/departments.controller";
import * as positionsController from "../modules/positions/positions.controller";
import * as structureController from "../modules/employee-structure/employee-structure.controller";
import type { AppContext } from "../types/api.types";

const organizationRoutes = new Hono<AppContext>();
organizationRoutes.use("*", authMiddleware);
organizationRoutes.use("*", requireFeature("employee_management"));

organizationRoutes.get("/departments", requireAnyPermissionOrError(["organization.departments.view", "departments.view"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to view departments.",
}), departmentsController.listDepartments);
organizationRoutes.post("/departments", requireAnyPermissionOrError(["organization.departments.manage", "departments.create"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage departments.",
}), departmentsController.createDepartment);
organizationRoutes.get("/departments/:id", requireAnyPermissionOrError(["organization.departments.view", "departments.view"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to view departments.",
}), departmentsController.getDepartment);
organizationRoutes.patch("/departments/:id", requireAnyPermissionOrError(["organization.departments.manage", "departments.edit"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage departments.",
}), departmentsController.updateDepartment);
organizationRoutes.post("/departments/:id/disable", requireAnyPermissionOrError(["organization.departments.manage", "departments.edit"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage departments.",
}), requireReason(), departmentsController.disableDepartment);
organizationRoutes.post("/departments/:id/enable", requireAnyPermissionOrError(["organization.departments.manage", "departments.edit"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage departments.",
}), requireReason(), departmentsController.enableDepartment);
organizationRoutes.post("/departments/:id/archive", requireAnyPermissionOrError(["organization.departments.manage", "departments.delete"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to archive departments.",
}), requireReason(), departmentsController.archiveDepartment);

organizationRoutes.get("/positions", requireAnyPermissionOrError(["organization.positions.view", "positions.view"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to view positions.",
}), positionsController.listPositions);
organizationRoutes.post("/positions", requireAnyPermissionOrError(["organization.positions.manage", "positions.create"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage positions.",
}), positionsController.createPosition);
organizationRoutes.get("/positions/:id", requireAnyPermissionOrError(["organization.positions.view", "positions.view"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to view positions.",
}), positionsController.getPosition);
organizationRoutes.patch("/positions/:id", requireAnyPermissionOrError(["organization.positions.manage", "positions.edit"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage positions.",
}), positionsController.updatePosition);
organizationRoutes.post("/positions/:id/disable", requireAnyPermissionOrError(["organization.positions.manage", "positions.edit"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage positions.",
}), requireReason(), positionsController.disablePosition);
organizationRoutes.post("/positions/:id/enable", requireAnyPermissionOrError(["organization.positions.manage", "positions.edit"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage positions.",
}), requireReason(), positionsController.enablePosition);
organizationRoutes.post("/positions/:id/archive", requireAnyPermissionOrError(["organization.positions.manage", "positions.delete"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to archive positions.",
}), requireReason(), positionsController.archivePosition);

organizationRoutes.get("/access-levels", requireAnyPermissionOrError(["organization.levels.view", "employees.structure.view"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to view access levels.",
}), structureController.listAccessLevels);
organizationRoutes.get("/level-role-templates", requireAnyPermissionOrError(["organization.levelRoleTemplates.view", "organization.levelRoleTemplates.manage"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to view level role templates.",
}), structureController.listLevelRoleTemplates);
organizationRoutes.post("/level-role-templates", requireAnyPermissionOrError(["organization.levelRoleTemplates.manage"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage level role templates.",
}), structureController.createLevelRoleTemplate);
organizationRoutes.patch("/level-role-templates/:id", requireAnyPermissionOrError(["organization.levelRoleTemplates.manage"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage level role templates.",
}), structureController.updateLevelRoleTemplate);
organizationRoutes.delete("/level-role-templates/:id", requireAnyPermissionOrError(["organization.levelRoleTemplates.manage"], {
  code: "ORGANIZATION_PERMISSION_DENIED",
  message: "You do not have permission to manage level role templates.",
}), structureController.archiveLevelRoleTemplate);

export { organizationRoutes };
