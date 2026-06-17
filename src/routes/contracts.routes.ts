import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermissionOrError } from "../middleware/permission.middleware";
import * as controller from "../modules/employee-contracts/employee-contracts.controller";
import type { AppContext } from "../types/api.types";

const contractsRoutes = new Hono<AppContext>();

contractsRoutes.use("*", authMiddleware);
contractsRoutes.use("*", requireFeature("employee_management"));
contractsRoutes.use("*", requireFeature("contract_tracking"));

contractsRoutes.get(
  "/",
  requireAnyPermissionOrError(["contracts.view", "employees.contracts.view", "employees.view"], {
    code: "CONTRACT_PERMISSION_DENIED",
    message: "You do not have permission to view employee contracts.",
  }),
  controller.listContracts,
);

export { contractsRoutes };
