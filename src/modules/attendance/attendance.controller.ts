import type { Context } from "hono";

import * as service from "./attendance.service";
import {
  validateAttendanceListFilters,
  validateClockInput,
  validateConflictResolveInput,
  validateCorrectionRequestInput,
  validateManualEntryInput,
  validateReviewInput,
} from "./attendance.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const id = (c: Context<AppContext>) => {
  const value = c.req.param("id");
  if (!value) throw new ValidationError("Attendance record is required.");
  return value;
};
const filters = (c: Context<AppContext>) =>
  validateAttendanceListFilters({
    date_from: c.req.query("date_from"),
    date_to: c.req.query("date_to"),
    attendance_date: c.req.query("attendance_date"),
    employee_id: c.req.query("employee_id"),
    outlet_id: c.req.query("outlet_id"),
    department_id: c.req.query("department_id"),
    position_id: c.req.query("position_id"),
    status: c.req.query("status"),
    event_type: c.req.query("event_type"),
    attendance_method: c.req.query("attendance_method"),
    source: c.req.query("source"),
    sync_status: c.req.query("sync_status"),
    approval_status: c.req.query("approval_status"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
    sort_by: c.req.query("sort_by"),
    sort_direction: c.req.query("sort_direction"),
  });

export const listAttendance = async (c: Context<AppContext>) => {
  const result = await service.listAttendance(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Attendance records loaded successfully.", { requestId: c.get("requestId") });
};

export const today = async (c: Context<AppContext>) => {
  const todayDate = new Date().toISOString().slice(0, 10);
  const result = await service.listAttendance(c.env, actor(c), {
    ...filters(c),
    attendance_date: todayDate,
  });
  return paginated(result.rows, result.pagination, "Today's attendance loaded successfully.", { requestId: c.get("requestId") });
};

export const monthly = async (c: Context<AppContext>) => {
  const month = c.req.query("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new ValidationError("Please choose a valid month.");
  const result = await service.listAttendance(c.env, actor(c), {
    ...filters(c),
    date_from: `${month}-01`,
    date_to: `${month}-31`,
  });
  return paginated(result.rows, result.pagination, "Monthly attendance loaded successfully.", { requestId: c.get("requestId") });
};

export const summary = async (c: Context<AppContext>) =>
  ok(await service.listAttendance(c.env, actor(c), filters(c)), "Attendance summary loaded successfully.", { requestId: c.get("requestId") });

export const clockIn = async (c: Context<AppContext>) => {
  const result = await service.clockIn(c.env, actor(c), validateClockInput(await body(c)));
  return ok(
    result,
    "conflict_created" in result
      ? "This employee is not assigned to this outlet. A conflict has been created for review."
      : "Clock-in recorded successfully.",
    { requestId: c.get("requestId") },
  );
};

export const clockOut = async (c: Context<AppContext>) => {
  const result = await service.clockOut(c.env, actor(c), validateClockInput(await body(c)));
  return ok(
    result,
    "conflict_created" in result
      ? "A missing clock-in conflict has been created for review."
      : "Clock-out recorded successfully.",
    { requestId: c.get("requestId") },
  );
};

export const manualEntry = async (c: Context<AppContext>) =>
  created(await service.manualEntry(c.env, actor(c), validateManualEntryInput(await body(c))), "Attendance record saved successfully.", { requestId: c.get("requestId") });

export const correctionRequest = async (c: Context<AppContext>) =>
  created(await service.createCorrectionRequest(c.env, actor(c), validateCorrectionRequestInput(await body(c))), "Attendance correction submitted successfully.", { requestId: c.get("requestId") });

export const approveCorrection = async (c: Context<AppContext>) =>
  ok(await service.approveCorrection(c.env, actor(c), id(c), validateReviewInput(await body(c))), "Attendance correction approved.", { requestId: c.get("requestId") });

export const rejectCorrection = async (c: Context<AppContext>) =>
  ok(await service.rejectCorrection(c.env, actor(c), id(c), validateReviewInput(await body(c))), "Attendance correction rejected.", { requestId: c.get("requestId") });

const listFilters = (c: Context<AppContext>) => ({
  status: c.req.query("status"),
  conflict_type: c.req.query("conflict_type"),
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  date_from: c.req.query("date_from"),
  date_to: c.req.query("date_to"),
  missing_type: c.req.query("missing_type"),
  page: Number(c.req.query("page") ?? 1),
  page_size: Number(c.req.query("page_size") ?? 25),
});

export const listCorrections = async (c: Context<AppContext>) =>
  {
    const result = await service.listCorrections(c.env, actor(c), listFilters(c));
    return paginated(
      result.rows,
      result.pagination,
      "Attendance corrections loaded successfully.",
      { requestId: c.get("requestId") },
    );
  };

export const listConflicts = async (c: Context<AppContext>) =>
  {
    const result = await service.listConflicts(c.env, actor(c), listFilters(c));
    return paginated(
      result.rows,
      result.pagination,
      "Attendance conflicts loaded successfully.",
      { requestId: c.get("requestId") },
    );
  };

export const resolveConflict = async (c: Context<AppContext>) =>
  ok(await service.resolveConflict(c.env, actor(c), id(c), validateConflictResolveInput(await body(c))), "Attendance conflict resolved successfully.", { requestId: c.get("requestId") });

export const missingPunches = async (c: Context<AppContext>) =>
  {
    const result = await service.listMissingPunches(c.env, actor(c), listFilters(c));
    return paginated(
      result.rows,
      result.pagination,
      "Missing punch records loaded successfully.",
      { requestId: c.get("requestId") },
    );
  };

export const getEvent = async (c: Context<AppContext>) =>
  ok(
    {
      event: await service.getEventDetail(c.env, actor(c), id(c)),
    },
    "Attendance event loaded successfully.",
    { requestId: c.get("requestId") },
  );
