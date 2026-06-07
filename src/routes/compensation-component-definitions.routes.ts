import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermissionOrError } from "../middleware/permission.middleware";
import * as employeesController from "../modules/employees/employees.controller";
import type { AppContext } from "../types/api.types";

const compensationComponentDefinitionsRoutes = new Hono<AppContext>();

const viewPermissions = [
  "employees.compensation.view",
  "employees.salary.view",
  "payroll.view",
  "settings.view",
  "payroll.settings.view",
];

const managePermissions = [
  "employees.compensation.manage",
  "payroll.manage",
  "settings.manage",
  "payroll.settings.manage",
];

compensationComponentDefinitionsRoutes.use("*", authMiddleware);
compensationComponentDefinitionsRoutes.use("*", requireFeature("employee_management"));

compensationComponentDefinitionsRoutes.get(
  "/",
  requireAnyPermissionOrError(viewPermissions, {
    code: "COMPENSATION_PERMISSION_DENIED",
    message: "You do not have permission to view compensation component definitions.",
  }),
  employeesController.listCompensationComponentDefinitions,
);

compensationComponentDefinitionsRoutes.post(
  "/",
  requireAnyPermissionOrError(managePermissions, {
    code: "COMPENSATION_PERMISSION_DENIED",
    message: "You do not have permission to manage compensation component definitions.",
  }),
  employeesController.createCompensationComponentDefinition,
);

compensationComponentDefinitionsRoutes.patch(
  "/:id",
  requireAnyPermissionOrError(managePermissions, {
    code: "COMPENSATION_PERMISSION_DENIED",
    message: "You do not have permission to manage compensation component definitions.",
  }),
  employeesController.updateCompensationComponentDefinition,
);

compensationComponentDefinitionsRoutes.post(
  "/:id/enable",
  requireAnyPermissionOrError(managePermissions, {
    code: "COMPENSATION_PERMISSION_DENIED",
    message: "You do not have permission to manage compensation component definitions.",
  }),
  employeesController.enableCompensationComponentDefinition,
);

compensationComponentDefinitionsRoutes.post(
  "/:id/disable",
  requireAnyPermissionOrError(managePermissions, {
    code: "COMPENSATION_PERMISSION_DENIED",
    message: "You do not have permission to manage compensation component definitions.",
  }),
  employeesController.disableCompensationComponentDefinition,
);

export { compensationComponentDefinitionsRoutes };
