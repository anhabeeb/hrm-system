import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";
import * as setupGuideController from "../modules/setup-guide/setup-guide.controller";
import type { AppContext } from "../types/api.types";

const setupGuideRoutes = new Hono<AppContext>();
const SETUP_GUIDE_VIEW_PERMISSIONS = ["setup_guide.view", "settings.view", "setup_guide.manage", "settings.manage"];
const SETUP_GUIDE_MANAGE_PERMISSIONS = ["setup_guide.manage", "settings.manage", "feature_settings.manage"];

setupGuideRoutes.use("*", authMiddleware);

setupGuideRoutes.get("/status", requireAnyPermission(SETUP_GUIDE_VIEW_PERMISSIONS), setupGuideController.getStatus);
setupGuideRoutes.get("/activities", requireAnyPermission(SETUP_GUIDE_VIEW_PERMISSIONS), setupGuideController.getActivities);
setupGuideRoutes.post("/activities/:activityKey/start", requireAnyPermission(SETUP_GUIDE_MANAGE_PERMISSIONS), setupGuideController.startActivity);
setupGuideRoutes.post("/activities/:activityKey/complete", requireAnyPermission(SETUP_GUIDE_MANAGE_PERMISSIONS), setupGuideController.completeActivity);
setupGuideRoutes.post("/activities/:activityKey/skip", requireAnyPermission(SETUP_GUIDE_MANAGE_PERMISSIONS), setupGuideController.skipActivity);
setupGuideRoutes.post("/activities/:activityKey/resume", requireAnyPermission(SETUP_GUIDE_MANAGE_PERMISSIONS), setupGuideController.resumeActivity);
setupGuideRoutes.post("/finish", requireAnyPermission(SETUP_GUIDE_MANAGE_PERMISSIONS), setupGuideController.finish);
setupGuideRoutes.post("/skip-for-now", requireAnyPermission(SETUP_GUIDE_MANAGE_PERMISSIONS), setupGuideController.skipForNow);
setupGuideRoutes.post("/skip", requireAnyPermission(SETUP_GUIDE_MANAGE_PERMISSIONS), setupGuideController.skipForNow);
setupGuideRoutes.post("/recalculate", requireAnyPermission(SETUP_GUIDE_MANAGE_PERMISSIONS), setupGuideController.recalculate);
setupGuideRoutes.post("/module-choice", requireAnyPermission(SETUP_GUIDE_MANAGE_PERMISSIONS), setupGuideController.moduleChoice);

export { setupGuideRoutes };
