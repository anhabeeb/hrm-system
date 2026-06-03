import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/profile-update-requests/profile-update-requests.controller";
import type { AppContext } from "../types/api.types";

const profileUpdateRequestsRoutes = new Hono<AppContext>();

profileUpdateRequestsRoutes.use("*", authMiddleware);
profileUpdateRequestsRoutes.use("*", requireFeature("my_profile"));
profileUpdateRequestsRoutes.use("*", requireFeature("kyc_update_requests"));

profileUpdateRequestsRoutes.get(
  "/",
  requirePermission("profile_update_requests.view"),
  controller.listRequests,
);
profileUpdateRequestsRoutes.get(
  "/:id",
  requirePermission("profile_update_requests.view"),
  controller.getRequest,
);
profileUpdateRequestsRoutes.post(
  "/:id/approve",
  requirePermission("profile_update_requests.approve"),
  requireReason({ fields: ["reason", "review_notes"] }),
  controller.approveRequest,
);
profileUpdateRequestsRoutes.post(
  "/:id/reject",
  requirePermission("profile_update_requests.reject"),
  requireReason({ fields: ["reason", "review_notes"] }),
  controller.rejectRequest,
);
profileUpdateRequestsRoutes.post(
  "/:id/return-for-more-info",
  requirePermission("profile_update_requests.return_for_more_info"),
  requireReason({ fields: ["reason", "review_notes"] }),
  controller.returnForMoreInfo,
);

export { profileUpdateRequestsRoutes };
