import { createMiddleware } from "hono/factory";

import * as settingsService from "../services/settings.service";
import type { AppContext } from "../types/api.types";
import { AuthError, DeviceAuthError, FeatureDisabledError } from "../utils/errors";

export const requireFeature = (featureKey: string) =>
  createMiddleware<AppContext>(async (c, next) => {
    const authUser = c.get("authUser");
    const deviceAuth = c.get("deviceAuth");
    let enabled = false;

    if (authUser) {
      enabled = await settingsService.isFeatureEnabled(
        c.env,
        authUser.companyId,
        featureKey,
        authUser,
      );
    } else if (deviceAuth) {
      enabled = await settingsService.isFeatureEnabledForDevice(
        c.env,
        deviceAuth.companyId,
        featureKey,
        deviceAuth,
      );
    } else {
      throw new AuthError("Please sign in to continue.");
    }

    if (!enabled) {
      throw new FeatureDisabledError();
    }

    await next();
  });

export const requireAnyFeature = (featureKeys: string[]) =>
  createMiddleware<AppContext>(async (c, next) => {
    const authUser = c.get("authUser");
    const deviceAuth = c.get("deviceAuth");
    let checks: boolean[];

    if (authUser) {
      checks = await Promise.all(
        featureKeys.map((featureKey) =>
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
        featureKeys.map((featureKey) =>
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
      throw new FeatureDisabledError();
    }

    await next();
  });
