import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { AppContext } from "../types/api.types";
import { LockedRecordError, ValidationError } from "../utils/errors";

type ValueSource =
  | string
  | {
      param?: string;
      query?: string;
      body?: string;
    }
  | ((c: Context<AppContext>) => string | null | undefined | Promise<string | null | undefined>);

const readBody = async (c: Context<AppContext>): Promise<Record<string, unknown>> =>
  c.req.json<Record<string, unknown>>().catch(() => ({}));

const resolveSource = async (
  c: Context<AppContext>,
  source: ValueSource,
): Promise<string | null> => {
  if (typeof source === "function") {
    return (await source(c)) ?? null;
  }

  if (typeof source === "string") {
    return c.req.param(source) ?? c.req.query(source) ?? null;
  }

  if (source.param) {
    return c.req.param(source.param) ?? null;
  }

  if (source.query) {
    return c.req.query(source.query) ?? null;
  }

  if (source.body) {
    const body = await readBody(c);
    const value = body[source.body];
    return typeof value === "string" ? value : null;
  }

  return null;
};

const isLockedStatus = (status: string | null | undefined): boolean =>
  status === "locked" || status === "paid";

const assertPayrollMonthUnlocked = async (
  env: Env,
  companyId: string,
  payrollMonth: string,
) => {
  const run = await env.DB.prepare(
    "SELECT status FROM payroll_runs WHERE company_id = ? AND payroll_month = ? LIMIT 1",
  )
    .bind(companyId, payrollMonth)
    .first<{ status: string }>();

  if (isLockedStatus(run?.status)) {
    throw new LockedRecordError();
  }
};

export const requireUnlockedPayrollPeriod = (payrollMonthSource: ValueSource) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = c.get("authUser");
    const payrollMonth = await resolveSource(c, payrollMonthSource);

    if (!context || !payrollMonth) {
      throw new ValidationError("Payroll month is required for this action.");
    }

    await assertPayrollMonthUnlocked(c.env, context.companyId, payrollMonth);
    await next();
  });

export const requireUnlockedPayrollRun = (payrollRunIdSource: ValueSource) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = c.get("authUser");
    const payrollRunId = await resolveSource(c, payrollRunIdSource);

    if (!context || !payrollRunId) {
      throw new ValidationError("Payroll run is required for this action.");
    }

    const run = await c.env.DB.prepare(
      "SELECT status FROM payroll_runs WHERE company_id = ? AND id = ? LIMIT 1",
    )
      .bind(context.companyId, payrollRunId)
      .first<{ status: string }>();

    if (isLockedStatus(run?.status)) {
      throw new LockedRecordError();
    }

    await next();
  });

export const requireAttendanceEditableForDate = (dateSource: ValueSource) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = c.get("authUser");
    const attendanceDate = await resolveSource(c, dateSource);

    if (!context || !attendanceDate) {
      throw new ValidationError("Attendance date is required for this action.");
    }

    await assertPayrollMonthUnlocked(
      c.env,
      context.companyId,
      attendanceDate.slice(0, 7),
    );
    await next();
  });

export const requireLeaveEditableForDateRange = (
  startDateSource: ValueSource,
  _endDateSource: ValueSource,
) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = c.get("authUser");
    const startDate = await resolveSource(c, startDateSource);

    if (!context || !startDate) {
      throw new ValidationError("Leave dates are required for this action.");
    }

    await assertPayrollMonthUnlocked(c.env, context.companyId, startDate.slice(0, 7));
    await next();
  });
