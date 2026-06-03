import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/attendance/attendance.controller";
import type { AppContext } from "../types/api.types";

const attendanceRoutes = new Hono<AppContext>();

attendanceRoutes.use("*", authMiddleware);
attendanceRoutes.use("*", requireFeature("attendance"));

attendanceRoutes.get("/", requirePermission("attendance.view"), controller.listAttendance);
attendanceRoutes.get("/today", requirePermission("attendance.view"), controller.today);
attendanceRoutes.get("/monthly", requirePermission("attendance.view"), controller.monthly);
attendanceRoutes.get("/summary", requirePermission("attendance.view"), controller.summary);
attendanceRoutes.get("/events", requirePermission("attendance.view"), controller.listEvents);
attendanceRoutes.get("/events/:id", requirePermission("attendance.view"), controller.getEvent);
attendanceRoutes.post("/clock-in", requireAnyPermission(["attendance.create", "attendance.manual_entry"]), controller.clockIn);
attendanceRoutes.post("/clock-out", requireAnyPermission(["attendance.create", "attendance.manual_entry"]), controller.clockOut);
attendanceRoutes.post("/manual-entry", requirePermission("attendance.manual_entry"), requireReason(), controller.manualEntry);
attendanceRoutes.post("/correction-request", requireAnyPermission(["attendance.manual_entry", "attendance.edit"]), requireReason(), controller.correctionRequest);
attendanceRoutes.post("/corrections/:id/approve", requirePermission("attendance.approve_correction"), requireReason({ fields: ["reason", "notes"] }), controller.approveCorrection);
attendanceRoutes.post("/corrections/:id/reject", requirePermission("attendance.reject_correction"), requireReason({ fields: ["reason", "notes"] }), controller.rejectCorrection);
attendanceRoutes.get("/corrections", requirePermission("attendance.view"), controller.listCorrections);
attendanceRoutes.get("/conflicts", requirePermission("attendance.view_conflicts"), controller.listConflicts);
attendanceRoutes.post("/conflicts/:id/resolve", requirePermission("attendance.resolve_conflicts"), requireReason({ fields: ["reason", "resolution_notes"] }), controller.resolveConflict);
attendanceRoutes.get("/missing-punches", requirePermission("attendance.view"), controller.missingPunches);

export { attendanceRoutes };
