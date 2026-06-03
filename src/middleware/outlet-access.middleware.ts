import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import * as permissionService from "../services/permission.service";
import type { AppContext } from "../types/api.types";
import { AuthError, OutletAccessError, ValidationError } from "../utils/errors";

type ValueSource =
  | string
  | {
      param?: string;
      query?: string;
      body?: string;
    }
  | ((c: Context<AppContext>) => string | null | undefined | Promise<string | null | undefined>);

const readBody = async (c: Context<AppContext>): Promise<Record<string, unknown>> =>
  c.req
    .json<Record<string, unknown>>()
    .catch(() => ({}));

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

export const requireOutletAccess = (outletIdSource: ValueSource) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = c.get("authUser");

    if (!context) {
      throw new AuthError("Please sign in to continue.");
    }

    const outletId = await resolveSource(c, outletIdSource);

    if (!outletId) {
      throw new ValidationError("Outlet is required for this action.");
    }

    if (!permissionService.hasOutletAccess(context, outletId)) {
      throw new OutletAccessError();
    }

    await next();
  });

export const requireEmployeeOutletAccess = (employeeIdSource: ValueSource) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = c.get("authUser");

    if (!context) {
      throw new AuthError("Please sign in to continue.");
    }

    const employeeId = await resolveSource(c, employeeIdSource);

    if (!employeeId) {
      throw new ValidationError("Employee is required for this action.");
    }

    await permissionService.canAccessEmployee(c.env, context, employeeId);
    await next();
  });
