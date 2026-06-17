import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAttendanceSubFeature, requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/attendance/attendance.controller";
import * as calendarController from "../modules/attendance/attendance-calendar.controller";
import * as reportController from "../modules/attendance/attendance-reports.controller";
import type { AppContext } from "../types/api.types";

const attendanceRoutes = new Hono<AppContext>();

attendanceRoutes.use("*", authMiddleware);
attendanceRoutes.use("*", requireFeature("attendance"));

attendanceRoutes.get("/", requirePermission("attendance.view"), controller.listAttendance);
attendanceRoutes.get("/today", requirePermission("attendance.view"), controller.today);
attendanceRoutes.get("/monthly", requirePermission("attendance.view"), controller.monthly);
attendanceRoutes.get("/summary", requirePermission("attendance.view"), controller.summary);
attendanceRoutes.get("/subfeatures", requireAnyPermission(["attendance.view", "attendance.calendar.view", "attendance.reports.view", "attendance.corrections.view", "payroll.attendanceReview.view", "payroll.view"]), controller.subFeatures);
attendanceRoutes.get("/calendar-employees", requireAnyPermission(["attendance.calendar.view", "attendance.calendar.viewTeam", "attendance.calendar.viewAll", "attendance.view", "attendance.reports.view", "payroll.attendanceReview.view", "payroll.view"]), calendarController.calendarEmployees);
attendanceRoutes.get("/employee-calendar", requireAnyPermission(["attendance.calendar.view", "attendance.calendar.viewTeam", "attendance.calendar.viewAll", "attendance.view", "attendance.reports.view"]), calendarController.attendanceCalendar);
attendanceRoutes.get("/reports/daily", requirePermission("attendance.reports.view"), reportController.daily);
attendanceRoutes.get("/reports/monthly", requirePermission("attendance.reports.view"), reportController.monthly);
attendanceRoutes.get("/reports/employee/:employeeId", requirePermission("attendance.reports.view"), reportController.employee);
attendanceRoutes.get("/reports/exceptions", requireAnyPermission(["attendance.exceptions.view", "attendance.reports.view"]), reportController.exceptions);
attendanceRoutes.get("/reports/device-punches", requireAnyPermission(["attendance.device_punches.view", "attendance.reports.view"]), reportController.devicePunches);
attendanceRoutes.get("/reports/summary", requirePermission("attendance.reports.view"), reportController.summary);
attendanceRoutes.get("/events", requirePermission("attendance.view"), controller.listEvents);
attendanceRoutes.get("/events/:id", requirePermission("attendance.view"), controller.getEvent);
attendanceRoutes.post("/clock-in", requireAttendanceSubFeature("attendance.manual_entry_enabled"), requireAnyPermission(["attendance.create", "attendance.manual_entry"]), controller.clockIn);
attendanceRoutes.post("/clock-out", requireAttendanceSubFeature("attendance.manual_entry_enabled"), requireAnyPermission(["attendance.create", "attendance.manual_entry"]), controller.clockOut);
attendanceRoutes.post("/manual-batch", requireAttendanceSubFeature("attendance.manual_entry_enabled"), requirePermission("attendance.manual_entry"), requireReason(), controller.manualBatch);
attendanceRoutes.post("/manual-entry", requireAttendanceSubFeature("attendance.manual_entry_enabled"), requirePermission("attendance.manual_entry"), requireReason(), controller.manualEntry);
attendanceRoutes.post("/correction-request", requireAttendanceSubFeature("attendance.corrections_enabled"), requireAnyPermission(["attendance.corrections.create", "attendance.corrections.createForOthers", "attendance.manual_entry", "attendance.edit"]), requireReason(), controller.correctionRequest);
attendanceRoutes.get("/corrections", requireAnyPermission(["attendance.view", "attendance.corrections.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.department.approve", "approvals.hrFinal.approve"]), controller.listCorrections);
attendanceRoutes.get("/corrections/:id", requireAnyPermission(["attendance.view", "attendance.corrections.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.department.approve", "approvals.hrFinal.approve"]), controller.getCorrection);
attendanceRoutes.get("/corrections/:id/approval-timeline", requireAnyPermission(["attendance.corrections.audit.view", "attendance.view", "approvals.requests.audit.view", "approvals.department.view", "approvals.hrFinal.view", "approvals.department.approve", "approvals.hrFinal.approve"]), controller.correctionTimeline);
attendanceRoutes.post("/corrections/:id/cancel", requireAttendanceSubFeature("attendance.corrections_enabled"), requireAnyPermission(["attendance.corrections.cancel", "attendance.corrections.cancelAny", "approvals.requests.cancel", "approvals.requests.cancelAny"]), requireReason({ fields: ["reason", "notes"] }), controller.cancelCorrection);
attendanceRoutes.post("/corrections/:id/approve", requireAttendanceSubFeature("attendance.corrections_enabled"), requireAnyPermission(["attendance.corrections.approve", "attendance.approve_correction", "approvals.department.approve", "approvals.hrFinal.approve"]), requireReason({ fields: ["reason", "notes"] }), controller.approveCorrection);
attendanceRoutes.post("/corrections/:id/reject", requireAttendanceSubFeature("attendance.corrections_enabled"), requireAnyPermission(["attendance.corrections.reject", "attendance.reject_correction", "approvals.department.reject", "approvals.hrFinal.reject"]), requireReason({ fields: ["reason", "notes"] }), controller.rejectCorrection);
attendanceRoutes.get("/conflicts", requirePermission("attendance.view_conflicts"), controller.listConflicts);
attendanceRoutes.post("/conflicts/:id/resolve", requirePermission("attendance.resolve_conflicts"), requireReason({ fields: ["reason", "resolution_notes"] }), controller.resolveConflict);
attendanceRoutes.get("/missing-punches", requirePermission("attendance.view"), controller.missingPunches);

export { attendanceRoutes };
