import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/assets/assets.controller";
import type { AppContext } from "../types/api.types";

const assetsRoutes = new Hono<AppContext>();

assetsRoutes.use("*", authMiddleware);
assetsRoutes.use("*", requireFeature("assets_uniforms"));

assetsRoutes.get("/", requirePermission("assets.view"), controller.listAssets);
assetsRoutes.post("/", requirePermission("assets.create"), controller.createAsset);
assetsRoutes.get("/deductions", requirePermission("assets.approve_deduction"), controller.listDeductions);
assetsRoutes.post("/deductions/:id/approve", requirePermission("assets.approve_deduction"), requireReason(), controller.approveDeduction);
assetsRoutes.post("/deductions/:id/reject", requirePermission("assets.approve_deduction"), requireReason(), controller.rejectDeduction);
assetsRoutes.get("/pending-return", requirePermission("assets.view"), controller.pendingReturn);
assetsRoutes.get("/:id", requirePermission("assets.view"), controller.getAsset);
assetsRoutes.patch("/:id", requirePermission("assets.edit"), controller.updateAsset);
assetsRoutes.post("/:id/assign", requirePermission("assets.assign"), requireReason(), controller.assignAsset);
assetsRoutes.post("/:id/return", requirePermission("assets.return"), requireReason(), controller.returnAsset);
assetsRoutes.post("/:id/mark-lost", requirePermission("assets.mark_lost"), requireReason(), controller.markLost);
assetsRoutes.post("/:id/mark-damaged", requirePermission("assets.mark_damaged"), requireReason(), controller.markDamaged);
assetsRoutes.post("/:id/request-deduction", requirePermission("assets.request_deduction"), requireReason(), controller.requestDeduction);

export { assetsRoutes };
