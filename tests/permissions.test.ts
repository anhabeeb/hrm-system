import { describe, expect, it } from "vitest";
import { Hono } from "hono";

import { requireDeviceOutletAccess } from "../src/middleware/device-auth.middleware";
import { requireFeature } from "../src/middleware/feature.middleware";
import {
  hasPermission,
  hasOutletAccess,
  isAdminOrSuperAdmin,
} from "../src/services/permission.service";
import type { AppContext, AuthActor, DeviceAuthContext } from "../src/types/api.types";
import { AppError, ReasonRequiredError } from "../src/utils/errors";
import { errorResponse } from "../src/utils/response";

const context = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  requestId: "req_test",
  companyId: "company_seed_default",
  actorUserId: "user_test",
  fullName: "Test User",
  email: "test@example.com",
  roles: [],
  roleKeys: [],
  permissions: [],
  outletIds: [],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const deviceContext = (
  overrides: Partial<DeviceAuthContext> = {},
): DeviceAuthContext => ({
  requestId: "req_test",
  companyId: "company_seed_default",
  deviceId: "device_test",
  outletId: "outlet_1",
  deviceType: "kiosk",
  ...overrides,
});

const envWithFeature = (
  feature: Record<string, unknown> | null,
): Env =>
  ({
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => feature,
        }),
      }),
    },
  }) as unknown as Env;

const withErrors = (app: Hono<AppContext>) => {
  app.onError((error, c) => {
    if (error instanceof AppError) {
      return errorResponse(error.statusCode, error.code, error.message, {
        requestId: c.get("requestId"),
      });
    }

    throw error;
  });

  return app;
};

const enabledFeature = {
  id: "feature_kiosk_attendance",
  company_id: "company_seed_default",
  feature_key: "kiosk_attendance",
  feature_name: "Kiosk Attendance",
  is_enabled: 1,
  status: "enabled",
  applies_to_all_outlets: 1,
  allowed_outlet_ids_json: null,
  allowed_role_ids_json: null,
  affects_payroll: 0,
  affects_attendance: 1,
  affects_leave: 0,
  affects_roster: 0,
  offline_enabled: 1,
  audit_enabled: 1,
  effective_from: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

interface TestErrorBody {
  error: {
    code: string;
    message: string;
  };
}

describe("permission service", () => {
  it("lets Super Admin pass normal permission checks", () => {
    expect(
      hasPermission(
        context({
          roleKeys: ["super_admin"],
          isSuperAdmin: true,
        }),
        "payroll.lock",
      ),
    ).toBe(true);
  });

  it("returns false when a permission is missing", () => {
    expect(hasPermission(context(), "payroll.lock")).toBe(false);
  });

  it("supports assigned outlet checks", () => {
    expect(hasOutletAccess(context({ outletIds: ["outlet_1"] }), "outlet_1")).toBe(
      true,
    );
    expect(hasOutletAccess(context({ outletIds: ["outlet_1"] }), "outlet_2")).toBe(
      false,
    );
  });

  it("recognizes Admin or Super Admin role keys", () => {
    expect(isAdminOrSuperAdmin(context({ roleKeys: ["admin"] }))).toBe(true);
    expect(isAdminOrSuperAdmin(context({ roleKeys: ["super_admin"] }))).toBe(true);
    expect(isAdminOrSuperAdmin(context({ roleKeys: ["employee"] }))).toBe(false);
  });
});

describe("access-control placeholders", () => {
  it("uses the standard reason required error", () => {
    const error = new ReasonRequiredError();

    expect(error.code).toBe("REASON_REQUIRED");
    expect(error.message).toBe("A reason is required for this action.");
  });

  it.todo("user-specific deny override beats role allow in D1 effective permissions");
  it.todo("disabled feature returns FEATURE_DISABLED");
  it.todo("Outlet Manager cannot access another outlet through middleware");
  it.todo("disabled device cannot authenticate");
  it.todo("device cannot access user-protected routes");
  it.todo("approval disabled mode skips approval but still requires reason");
  it.todo("My Profile permissions from seeds can be resolved");
});

describe("feature middleware", () => {
  it("works with authUser context", async () => {
    const app = withErrors(new Hono<AppContext>());

    app.use("*", async (c, next) => {
      c.set("requestId", "req_test");
      c.set("authUser", context());
      await next();
    });
    app.get("/employees", requireFeature("employee_management"), (c) =>
      c.text("ok"),
    );

    const response = await app.request(
      "/employees",
      {},
      envWithFeature({
        ...enabledFeature,
        feature_key: "employee_management",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("works with deviceAuth context", async () => {
    const app = withErrors(new Hono<AppContext>());

    app.use("*", async (c, next) => {
      c.set("requestId", "req_test");
      c.set("deviceAuth", deviceContext());
      await next();
    });
    app.post("/clock-in", requireFeature("kiosk_attendance"), (c) =>
      c.text("ok"),
    );

    const response = await app.request(
      "/clock-in",
      {
        method: "POST",
      },
      envWithFeature(enabledFeature),
    );

    expect(response.status).toBe(200);
  });

  it("blocks disabled features for deviceAuth context", async () => {
    const app = withErrors(new Hono<AppContext>());

    app.use("*", async (c, next) => {
      c.set("requestId", "req_test");
      c.set("deviceAuth", deviceContext());
      await next();
    });
    app.post("/clock-in", requireFeature("kiosk_attendance"), (c) =>
      c.text("ok"),
    );

    const response = await app.request(
      "/clock-in",
      {
        method: "POST",
      },
      envWithFeature({
        ...enabledFeature,
        is_enabled: 0,
        status: "disabled",
      }),
    );
    const body = await response.json<TestErrorBody>();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FEATURE_DISABLED");
    expect(body.error.message).toBe("This feature is currently disabled.");
  });
});

describe("device outlet middleware", () => {
  it("fails when deviceAuth context is missing", async () => {
    const app = withErrors(new Hono<AppContext>());

    app.use("*", async (c, next) => {
      c.set("requestId", "req_test");
      await next();
    });
    app.post(
      "/outlets/:outlet_id/clock-in",
      requireDeviceOutletAccess("param"),
      (c) => c.text("ok"),
    );

    const response = await app.request("/outlets/outlet_1/clock-in", {
      method: "POST",
    });
    const body = await response.json<TestErrorBody>();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("DEVICE_AUTH_REQUIRED");
    expect(body.error.message).toBe("Device authentication is required.");
  });

  it("blocks the wrong outlet", async () => {
    const app = withErrors(new Hono<AppContext>());

    app.use("*", async (c, next) => {
      c.set("requestId", "req_test");
      c.set("deviceAuth", deviceContext({ outletId: "outlet_1" }));
      await next();
    });
    app.post(
      "/outlets/:outlet_id/clock-in",
      requireDeviceOutletAccess("param"),
      (c) => c.text("ok"),
    );

    const response = await app.request("/outlets/outlet_2/clock-in", {
      method: "POST",
    });
    const body = await response.json<TestErrorBody>();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("DEVICE_OUTLET_DENIED");
    expect(body.error.message).toBe(
      "This device is not allowed to access this outlet.",
    );
  });
});
