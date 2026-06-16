import type { Context } from "hono";

import * as service from "./attendance-calendar.service";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { ok } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const month = (c: Context<AppContext>) => {
  const value = c.req.query("month") ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(value)) throw new ValidationError("Please choose a valid calendar month.");
  return value;
};

const baseQuery = (c: Context<AppContext>) => ({
  employee_id: c.req.query("employee_id") ?? undefined,
  month: month(c),
  payroll_period_id: c.req.query("payroll_period_id") ?? undefined,
});

const numberQuery = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const employeeAttendanceCalendar = async (c: Context<AppContext>) =>
  ok(
    await service.getEmployeeAttendanceCalendar(c.env, actor(c), {
      ...baseQuery(c),
      employee_id: c.req.param("employeeId") || c.req.param("id") || baseQuery(c).employee_id,
      mode: "employee",
    }),
    "Employee attendance calendar loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const attendanceCalendar = async (c: Context<AppContext>) =>
  ok(
    await service.getEmployeeAttendanceCalendar(c.env, actor(c), {
      ...baseQuery(c),
      mode: "attendance",
    }),
    "Attendance calendar loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const calendarEmployees = async (c: Context<AppContext>) =>
  ok(
    await service.listAttendanceCalendarEmployees(c.env, actor(c), {
      search: c.req.query("search") ?? undefined,
      department_id: c.req.query("department_id") ?? undefined,
      outlet_id: c.req.query("outlet_id") ?? undefined,
      limit: numberQuery(c.req.query("limit") ?? c.req.query("page_size")),
      mode: c.req.query("mode") === "payroll" ? "payroll" : "attendance",
    }),
    "Attendance calendar employee lookup loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const payrollAttendanceCalendar = async (c: Context<AppContext>) =>
  ok(
    await service.getPayrollAttendanceCalendar(c.env, actor(c), {
      ...baseQuery(c),
      mode: "payroll",
    }),
    "Payroll attendance review calendar loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const selfAttendanceCalendar = async (c: Context<AppContext>) =>
  ok(
    await service.getSelfAttendanceCalendar(c.env, actor(c), {
      ...baseQuery(c),
      mode: "self",
    }),
    "My attendance calendar loaded successfully.",
    { requestId: c.get("requestId") },
  );
