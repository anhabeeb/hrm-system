import { createMiddleware } from "hono/factory";

import { resolveModuleFeatureAliases } from "../config/module-codes";
import * as settingsService from "../services/settings.service";
import type { AppContext } from "../types/api.types";
import { AuthError, DeviceAuthError, FeatureDisabledError } from "../utils/errors";

export const requireFeature = (featureKey: string) =>
  createMiddleware<AppContext>(async (c, next) => {
    const authUser = c.get("authUser");
    const deviceAuth = c.get("deviceAuth");
    const featureKeys = resolveModuleFeatureAliases(featureKey);
    let enabled = false;

    if (authUser) {
      const checks = await Promise.all(
        featureKeys.map((key) =>
          settingsService.isFeatureEnabled(c.env, authUser.companyId, key, authUser),
        ),
      );
      enabled = checks.some(Boolean);
    } else if (deviceAuth) {
      const checks = await Promise.all(
        featureKeys.map((key) =>
          settingsService.isFeatureEnabledForDevice(c.env, deviceAuth.companyId, key, deviceAuth),
        ),
      );
      enabled = checks.some(Boolean);
    } else {
      throw new AuthError("Please sign in to continue.");
    }

    if (!enabled) {
      throw new FeatureDisabledError("This module is currently disabled.");
    }

    await next();
  });

export const requireAnyFeature = (featureKeys: string[]) =>
  createMiddleware<AppContext>(async (c, next) => {
    const authUser = c.get("authUser");
    const deviceAuth = c.get("deviceAuth");
    let checks: boolean[];

    const expandedFeatureKeys = featureKeys.flatMap(resolveModuleFeatureAliases);

    if (authUser) {
      checks = await Promise.all(
        expandedFeatureKeys.map((featureKey) =>
          settingsService.isFeatureEnabled(
            c.env,
            authUser.companyId,
            featureKey,
            authUser,
          ),
        ),
      );
    } else if (deviceAuth) {
      checks = await Promise.all(
        expandedFeatureKeys.map((featureKey) =>
          settingsService.isFeatureEnabledForDevice(
            c.env,
            deviceAuth.companyId,
            featureKey,
            deviceAuth,
          ),
        ),
      );
    } else {
      throw new DeviceAuthError("Device authentication is required.");
    }

    if (!checks.some(Boolean)) {
      throw new FeatureDisabledError("This module is currently disabled.");
    }

    await next();
  });
