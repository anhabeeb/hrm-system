import type { Context } from "hono";

import * as service from "./attendance-reports.service";
import { validateAttendanceReportFilters } from "./attendance-reports.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const query = (c: Context<AppContext>) => ({
  date: c.req.query("date"),
  from_date: c.req.query("from_date") ?? c.req.query("date_from"),
  to_date: c.req.query("to_date") ?? c.req.query("date_to"),
  month: c.req.query("month"),
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  department_id: c.req.query("department_id"),
  position_id: c.req.query("position_id"),
  attendance_status: c.req.query("attendance_status") ?? c.req.query("status"),
  source: c.req.query("source"),
  device_id: c.req.query("device_id"),
  exception_type: c.req.query("exception_type"),
  status: c.req.query("status"),
  late_only: c.req.query("late_only"),
  early_checkout_only: c.req.query("early_checkout_only"),
  missing_checkin_only: c.req.query("missing_checkin_only"),
  missing_checkout_only: c.req.query("missing_checkout_only"),
  absent_only: c.req.query("absent_only"),
  overtime_only: c.req.query("overtime_only"),
  leave_related_only: c.req.query("leave_related_only"),
  holiday_related_only: c.req.query("holiday_related_only"),
  include_details: c.req.query("include_details"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

const reportResponse = (
  c: Context<AppContext>,
  payload: unknown,
  message = "Attendance report loaded successfully.",
) => Response.json(
  {
    success: true,
    ...(payload as Record<string, unknown>),
    message,
  },
  {
    status: 200,
    headers: c.get("requestId") ? { "x-request-id": c.get("requestId") } : undefined,
  },
);

export const daily = async (c: Context<AppContext>) =>
  reportResponse(
    c,
    await service.dailyReport(c.env, actor(c), validateAttendanceReportFilters(query(c), "daily")),
    "Daily attendance report loaded successfully.",
  );

export const monthly = async (c: Context<AppContext>) =>
  reportResponse(
    c,
    await service.monthlyReport(c.env, actor(c), validateAttendanceReportFilters(query(c), "monthly")),
    "Monthly attendance report loaded successfully.",
  );

export const employee = async (c: Context<AppContext>) => {
  const employeeId = c.req.param("employeeId");
  if (!employeeId) throw new ValidationError("Employee is required.");
  return reportResponse(
    c,
    await service.employeeReport(c.env, actor(c), employeeId, validateAttendanceReportFilters({
      ...query(c),
      employee_id: employeeId,
    }, "employee_detail")),
    "Employee attendance report loaded successfully.",
  );
};

export const exceptions = async (c: Context<AppContext>) =>
  reportResponse(
    c,
    await service.exceptionsReport(c.env, actor(c), validateAttendanceReportFilters(query(c), "exceptions")),
    "Attendance exceptions report loaded successfully.",
  );

export const devicePunches = async (c: Context<AppContext>) =>
  reportResponse(
    c,
    await service.devicePunchesReport(c.env, actor(c), validateAttendanceReportFilters(query(c), "device_punches")),
    "Device punch report loaded successfully.",
  );

export const summary = async (c: Context<AppContext>) =>
  reportResponse(
    c,
    await service.summaryReport(c.env, actor(c), validateAttendanceReportFilters(query(c), "summary")),
    "Attendance report summary loaded successfully.",
  );

