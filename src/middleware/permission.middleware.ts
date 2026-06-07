import { createMiddleware } from "hono/factory";

import * as permissionService from "../services/permission.service";
import type { AppContext, AuthActor } from "../types/api.types";
import { AuthError, PermissionError } from "../utils/errors";

const getContext = (authUser?: AuthActor): AuthActor => {
  if (!authUser) {
    throw new AuthError("Please sign in to continue.");
  }

  return authUser;
};

export const requirePermission = (permissionKey: string) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = getContext(c.get("authUser"));

    if (!permissionService.hasPermission(context, permissionKey)) {
      throw new PermissionError();
    }

    await next();
  });

export const requireAnyPermission = (permissionKeys: string[]) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = getContext(c.get("authUser"));

    if (!permissionService.hasAnyPermission(context, permissionKeys)) {
      throw new PermissionError();
    }

    await next();
  });

export const requireAnyPermissionOrError = (
  permissionKeys: string[],
  error: { code: string; message: string },
) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = getContext(c.get("authUser"));

    if (!permissionService.hasAnyPermission(context, permissionKeys)) {
      throw new PermissionError(error.message, error.code);
    }

    await next();
  });

export const requireAllPermissions = (permissionKeys: string[]) =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = getContext(c.get("authUser"));

    if (!permissionService.hasAllPermissions(context, permissionKeys)) {
      throw new PermissionError();
    }

    await next();
  });

export const requireSuperAdmin = () =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = getContext(c.get("authUser"));

    if (!permissionService.isSuperAdmin(context)) {
      throw new PermissionError();
    }

    await next();
  });

export const requireAdminOrSuperAdmin = () =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = getContext(c.get("authUser"));

    if (!permissionService.isAdminOrSuperAdmin(context)) {
      throw new PermissionError();
    }

    await next();
  });
