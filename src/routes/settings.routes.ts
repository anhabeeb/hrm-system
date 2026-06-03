import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import { requireSettingsAccess } from "../middleware/settings-access.middleware";
import * as settingsController from "../modules/settings/settings.controller";
import type { AppContext } from "../types/api.types";

const settingsRoutes = new Hono<AppContext>();

settingsRoutes.use("*", authMiddleware);

settingsRoutes.get(
  "/",
  requireSettingsAccess({
    mode: "view",
    permissions: ["settings.view"],
    permissionMessage: "You do not have permission to view settings.",
  }),
  settingsController.getAllSettings,
);

settingsRoutes.get(
  "/features",
  requireSettingsAccess({ mode: "view", group: "features" }),
  settingsController.listFeatures,
);

settingsRoutes.patch(
  "/features",
  requireSettingsAccess({ mode: "manage", group: "features" }),
  requireReason(),
  settingsController.bulkUpdateFeatures,
);

settingsRoutes.get(
  "/features/:featureKey",
  requireSettingsAccess({ mode: "view", group: "features" }),
  settingsController.getFeature,
);

settingsRoutes.patch(
  "/features/:featureKey",
  requireSettingsAccess({ mode: "manage", group: "features" }),
  requireReason(),
  settingsController.updateFeature,
);

settingsRoutes.get(
  "/approvals",
  requireSettingsAccess({ mode: "view", group: "approval_workflows" }),
  settingsController.getApprovalSettings,
);

settingsRoutes.patch(
  "/approvals",
  requireSettingsAccess({ mode: "manage", group: "approval_workflows" }),
  requireReason(),
  settingsController.updateApprovalSettings,
);

settingsRoutes.get(
  "/approval-thresholds",
  requireSettingsAccess({ mode: "view", group: "approval_thresholds" }),
  settingsController.listApprovalThresholds,
);

settingsRoutes.get(
  "/approval-thresholds/:id",
  requireSettingsAccess({ mode: "view", group: "approval_thresholds" }),
  settingsController.getApprovalThreshold,
);

settingsRoutes.patch(
  "/approval-thresholds/:id",
  requireSettingsAccess({ mode: "manage", group: "approval_thresholds" }),
  requireReason(),
  settingsController.updateApprovalThreshold,
);

settingsRoutes.get(
  "/change-log",
  requireSettingsAccess({
    mode: "view",
    permissions: ["settings.view", "audit_settings.view"],
    permissionMessage: "You do not have permission to view settings history.",
  }),
  settingsController.getSettingsChangeLog,
);

settingsRoutes.post(
  "/:group/reset-defaults",
  requireSettingsAccess({ mode: "manage", groupParam: "group" }),
  requireReason(),
  settingsController.resetDefaults,
);

settingsRoutes.get(
  "/:group",
  requireSettingsAccess({ mode: "view", groupParam: "group" }),
  settingsController.getSettingsGroup,
);

settingsRoutes.patch(
  "/:group",
  requireSettingsAccess({ mode: "manage", groupParam: "group" }),
  requireReason(),
  settingsController.updateSettingsGroup,
);

export { settingsRoutes };
