import { createMiddleware } from "hono/factory";

import { authenticateDevice, ensureDeviceOutletAccess } from "../services/device-auth.service";
import type { AppContext } from "../types/api.types";
import { DeviceAuthError } from "../utils/errors";

const readBearerToken = (authorization: string | undefined): string | null => {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
};

export const deviceAuthMiddleware = createMiddleware<AppContext>(async (c, next) => {
  const token =
    readBearerToken(c.req.header("authorization")) ??
    c.req.header("x-device-token") ??
    null;
  const context = await authenticateDevice(c.env, token, c.get("requestId"));

  c.set("deviceAuth", context);
  await next();
});

export const requireDeviceOutletAccess = (outletIdSource: "param" | "query" | "body", key = "outlet_id") =>
  createMiddleware<AppContext>(async (c, next) => {
    const context = c.get("deviceAuth");
    let outletId: string | null = null;

    if (!context) {
      throw new DeviceAuthError("Device authentication is required.");
    }

    if (outletIdSource === "param") {
      outletId = c.req.param(key) ?? null;
    } else if (outletIdSource === "query") {
      outletId = c.req.query(key) ?? null;
    } else {
      const body = await c.req
        .json<Record<string, unknown>>()
        .catch((): Record<string, unknown> => ({}));
      outletId = typeof body[key] === "string" ? body[key] : null;
    }

    ensureDeviceOutletAccess(context, outletId);

    await next();
  });
