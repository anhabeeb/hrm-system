import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/holidays/holidays.controller";
import type { AppContext } from "../types/api.types";

const holidaysRoutes = new Hono<AppContext>();

holidaysRoutes.use("*", authMiddleware);
holidaysRoutes.use("*", requireFeature("holidays"));

holidaysRoutes.get("/", requireAnyPermission(["holidays.view", "holidays.calendar.view"]), controller.listHolidays);
holidaysRoutes.get("/settings", requireAnyPermission(["holidays.settings.manage", "holiday_settings.view", "holiday_settings.manage"]), controller.getSettings);
holidaysRoutes.patch("/settings", requireAnyPermission(["holidays.settings.manage", "holiday_settings.manage"]), requireReason(), controller.updateSettings);
holidaysRoutes.get("/calendar", requireAnyPermission(["holidays.calendar.view", "holidays.view"]), controller.calendar);
holidaysRoutes.get("/range", requireAnyPermission(["holidays.calendar.view", "holidays.view"]), controller.range);
holidaysRoutes.post("/check-date", requireAnyPermission(["holidays.calendar.view", "holidays.view"]), controller.checkDate);
holidaysRoutes.post("/bulk-import", requireAnyPermission(["holidays.import", "holidays.create"]), requireReason(), controller.bulkUpsert);
holidaysRoutes.post("/bulk-upsert", requireAnyPermission(["holidays.import", "holidays.create", "holidays.edit", "holidays.override"]), requireReason(), controller.bulkUpsert);
holidaysRoutes.post("/", requirePermission("holidays.create"), requireReason(), controller.createHoliday);
holidaysRoutes.get("/:id", requireAnyPermission(["holidays.view", "holidays.calendar.view", "holidays.audit.view"]), controller.getHoliday);
holidaysRoutes.patch("/:id", requirePermission("holidays.edit"), requireReason(), controller.updateHoliday);
holidaysRoutes.post("/:id/archive", requireAnyPermission(["holidays.archive", "holidays.delete", "holidays.enable_disable"]), requireReason(), controller.archiveHoliday);
holidaysRoutes.post("/:id/restore", requireAnyPermission(["holidays.restore", "holidays.enable_disable"]), requireReason(), controller.restoreHoliday);

export { holidaysRoutes };
