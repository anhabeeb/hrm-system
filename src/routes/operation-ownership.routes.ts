import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermissionOrError } from "../middleware/permission.middleware";
import * as controller from "../modules/operation-ownership/operation-ownership.controller";
import type { AppContext } from "../types/api.types";

const operationOwnershipRoutes = new Hono<AppContext>();

operationOwnershipRoutes.use("*", authMiddleware);

const viewPermissions = [
  "operationOwnership.view",
  "operationOwnership.businessFunctions.view",
  "operationOwnership.matrix.view",
  "operationOwnership.catalog.view",
  "operationOwnership.assignments.view",
];
const managePermissions = [
  "operationOwnership.manage",
  "operationOwnership.businessFunctions.manage",
  "operationOwnership.matrix.manage",
  "operationOwnership.catalog.manage",
  "operationOwnership.assignments.manage",
];

const viewGuard = requireAnyPermissionOrError(viewPermissions, {
  code: "OPERATION_OWNERSHIP_PERMISSION_DENIED",
  message: "You do not have permission to view operation ownership.",
});
const manageGuard = requireAnyPermissionOrError(managePermissions, {
  code: "OPERATION_OWNERSHIP_PERMISSION_DENIED",
  message: "You do not have permission to manage operation ownership.",
});

operationOwnershipRoutes.get("/business-functions", viewGuard, controller.listBusinessFunctions);
operationOwnershipRoutes.post("/business-functions", manageGuard, controller.createBusinessFunction);
operationOwnershipRoutes.get("/business-functions/:id", viewGuard, controller.getBusinessFunction);
operationOwnershipRoutes.patch("/business-functions/:id", manageGuard, controller.updateBusinessFunction);
operationOwnershipRoutes.post("/business-functions/:id/disable", manageGuard, controller.disableBusinessFunction);
operationOwnershipRoutes.post("/business-functions/:id/enable", manageGuard, controller.enableBusinessFunction);
operationOwnershipRoutes.post("/business-functions/:id/archive", manageGuard, controller.archiveBusinessFunction);

operationOwnershipRoutes.get("/function-assignments", viewGuard, controller.listFunctionAssignments);
operationOwnershipRoutes.post("/function-assignments", manageGuard, controller.createFunctionAssignment);
operationOwnershipRoutes.patch("/function-assignments/:id", manageGuard, controller.updateFunctionAssignment);
operationOwnershipRoutes.post("/function-assignments/:id/disable", manageGuard, controller.disableFunctionAssignment);
operationOwnershipRoutes.post("/function-assignments/:id/enable", manageGuard, controller.enableFunctionAssignment);
operationOwnershipRoutes.post("/function-assignments/:id/archive", manageGuard, controller.archiveFunctionAssignment);

operationOwnershipRoutes.get("/operations", viewGuard, controller.listOperations);
operationOwnershipRoutes.post("/operations", manageGuard, controller.createOperation);
operationOwnershipRoutes.get("/operations/:operationCode", viewGuard, controller.getOperation);
operationOwnershipRoutes.patch("/operations/:operationCode", manageGuard, controller.updateOperation);
operationOwnershipRoutes.post("/operations/:operationCode/disable", manageGuard, controller.disableOperation);
operationOwnershipRoutes.post("/operations/:operationCode/enable", manageGuard, controller.enableOperation);
operationOwnershipRoutes.post("/operations/:operationCode/archive", manageGuard, controller.archiveOperation);

operationOwnershipRoutes.get("/responsibilities", viewGuard, controller.listResponsibilities);
operationOwnershipRoutes.post("/responsibilities", manageGuard, controller.createResponsibility);
operationOwnershipRoutes.get("/responsibilities/:id", viewGuard, controller.getResponsibility);
operationOwnershipRoutes.patch("/responsibilities/:id", manageGuard, controller.updateResponsibility);
operationOwnershipRoutes.post("/responsibilities/:id/disable", manageGuard, controller.disableResponsibility);
operationOwnershipRoutes.post("/responsibilities/:id/enable", manageGuard, controller.enableResponsibility);
operationOwnershipRoutes.post("/responsibilities/:id/archive", manageGuard, controller.archiveResponsibility);
operationOwnershipRoutes.get("/operations/:operationCode/responsibilities", viewGuard, controller.listOperationResponsibilities);
operationOwnershipRoutes.post("/operations/:operationCode/responsibilities", manageGuard, controller.createOperationResponsibility);

operationOwnershipRoutes.post("/resolve", viewGuard, controller.resolveResponsibility);
operationOwnershipRoutes.get("/matrix-summary", viewGuard, controller.getMatrixSummary);
operationOwnershipRoutes.get("/setup-warnings", viewGuard, controller.getSetupWarnings);

export { operationOwnershipRoutes };
