import { createMiddleware } from "hono/factory";

import {
  SETTINGS_GROUP_MANAGE_PERMISSIONS,
  SETTINGS_GROUP_VIEW_PERMISSIONS,
} from "../modules/settings/settings.constants";
import type { SettingsGroup } from "../modules/settings/settings.types";
import { validateSettingsGroup } from "../modules/settings/settings.validators";
import * as permissionService from "../services/permission.service";
import * as settingsService from "../services/settings.service";
import type { AppContext, AuthActor } from "../types/api.types";
import { AuthError, FeatureDisabledError, PermissionError } from "../utils/errors";

type SettingsAccessMode = "view" | "manage";

interface SettingsAccessOptions {
  mode: SettingsAccessMode;
  group?: SettingsGroup;
  groupParam?: string;
  permissions?: readonly string[];
  permissionMessage?: string;
}

const getAuthUser = (authUser?: AuthActor): AuthActor => {
  if (!authUser) {
    throw new AuthError("Please sign in to continue.");
  }

  return authUser;
};

export const getSettingsGroupPermissions = (
  group: SettingsGroup,
  mode: SettingsAccessMode,
): readonly string[] =>
  mode === "view"
    ? SETTINGS_GROUP_VIEW_PERMISSIONS[group]
    : SETTINGS_GROUP_MANAGE_PERMISSIONS[group];

export const canAccessSettingsGroup = (
  context: AuthActor,
  group: SettingsGroup,
  mode: SettingsAccessMode,
): boolean =>
  permissionService.hasAnyPermission(
    context,
    [...getSettingsGroupPermissions(group, mode)],
  );

export const requireSettingsAccess = (options: SettingsAccessOptions) =>
  createMiddleware<AppContext>(async (c, next) => {
    const authUser = getAuthUser(c.get("authUser"));

    if (!permissionService.isSuperAdmin(authUser)) {
      const settingsEnabled = await settingsService.isFeatureEnabled(
        c.env,
        authUser.companyId,
        "settings",
        authUser,
      );

      if (!settingsEnabled) {
        throw new FeatureDisabledError("Settings are currently disabled.");
      }
    }

    if (permissionService.isSuperAdmin(authUser)) {
      await next();
      return;
    }

    const group =
      options.group ??
      (options.groupParam
        ? validateSettingsGroup(c.req.param(options.groupParam) ?? "")
        : undefined);
    const permissions = options.permissions
      ? [...options.permissions]
      : group
        ? [...getSettingsGroupPermissions(group, options.mode)]
        : [];

    if (!permissionService.hasAnyPermission(authUser, permissions)) {
      throw new PermissionError(
        options.permissionMessage ??
          (options.mode === "view"
            ? "You do not have permission to view this settings group."
            : "You do not have permission to manage this settings group."),
      );
    }

    await next();
  });
