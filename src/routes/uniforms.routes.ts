import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/uniforms/uniforms.controller";
import type { AppContext } from "../types/api.types";

const uniformsRoutes = new Hono<AppContext>();

uniformsRoutes.use("*", authMiddleware);
uniformsRoutes.use("*", requireFeature("uniform_tracking"));

uniformsRoutes.get("/", requirePermission("uniforms.view"), controller.listUniforms);
uniformsRoutes.post("/", requirePermission("uniforms.issue"), controller.issueUniform);
uniformsRoutes.post("/issue", requirePermission("uniforms.issue"), controller.issueUniform);
uniformsRoutes.get("/pending-return", requirePermission("uniforms.pending_return"), controller.pendingReturn);
uniformsRoutes.get("/:id", requirePermission("uniforms.view"), controller.getUniform);
uniformsRoutes.post("/:id/return", requirePermission("uniforms.return"), requireReason(), controller.returnUniform);

export { uniformsRoutes };
