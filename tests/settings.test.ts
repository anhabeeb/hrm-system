import { describe, expect, it } from "vitest";
import { Hono } from "hono";

import {
  canAccessSettingsGroup,
  requireSettingsAccess,
} from "../src/middleware/settings-access.middleware";
import { getDefaultUiPreferences } from "../src/modules/settings/settings.service";
import {
  FeatureDependencyError,
  validateApprovalSettingsInput,
  validateApprovalThresholdInput,
  validateFeatureDependencies,
  validateUpdateSettingsGroupInput,
} from "../src/modules/settings/settings.validators";
import type { AppContext, AuthActor } from "../src/types/api.types";
import { AppError, ValidationError } from "../src/utils/errors";
import { errorResponse } from "../src/utils/response";

const authContext = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  requestId: "req_settings_test",
  companyId: "company_seed_default",
  actorUserId: "user_settings_test",
  fullName: "Settings Tester",
  email: "settings@example.com",
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

const envWithSettingsFeature = (enabled: boolean): Env =>
  ({
    DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => ({
            id: "feature_settings",
            company_id: "company_seed_default",
            feature_key: "settings",
            feature_name: "Settings",
            is_enabled: enabled ? 1 : 0,
            status: enabled ? "enabled" : "disabled",
            applies_to_all_outlets: 1,
            allowed_outlet_ids_json: null,
            allowed_role_ids_json: null,
            affects_payroll: 0,
            affects_attendance: 0,
            affects_leave: 0,
            affects_roster: 0,
            offline_enabled: 0,
            audit_enabled: 1,
            effective_from: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          }),
        }),
      }),
    },
  }) as unknown as Env;

interface TestErrorBody {
  error: {
    code: string;
    message: string;
  };
}

const appWithSettingsAccess = (
  user: AuthActor,
  mode: "view" | "manage",
  groupParam = "group",
) => {
  const app = new Hono<AppContext>();

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return errorResponse(error.statusCode, error.code, error.message, {
        requestId: c.get("requestId"),
      });
    }

    throw error;
  });
  app.use("*", async (c, next) => {
    c.set("requestId", "req_settings_test");
    c.set("authUser", user);
    await next();
  });
  app.all(
    "/settings/:group",
    requireSettingsAccess({ mode, groupParam }),
    (c) => c.text("ok"),
  );

  return app;
};

describe("settings validators", () => {
  it("requires a reason for sensitive settings updates", () => {
    expect(() =>
      validateUpdateSettingsGroupInput("payroll", {
        settings: {
          "payroll.default_rules": {
            salary_calculation_basis: "fixed_30_days",
          },
        },
        effective_date: "2026-06-01",
      }),
    ).toThrow(ValidationError);
  });

  it("requires an effective date for payroll-impacting settings", () => {
    expect(() =>
      validateUpdateSettingsGroupInput("payroll", {
        settings: {
          "payroll.default_rules": {
            salary_calculation_basis: "fixed_30_days",
          },
        },
        reason: "Updating payroll defaults",
      }),
    ).toThrow("This setting affects payroll. Please select an effective date.");
  });

  it("blocks enabling payslips until Payroll is enabled", () => {
    expect(() =>
      validateFeatureDependencies("payslips", true, new Set()),
    ).toThrow(FeatureDependencyError);

    expect(() =>
      validateFeatureDependencies("payslips", true, new Set(["payroll"])),
    ).not.toThrow();
  });

  it("blocks enabling long leave until leave management and Payroll are enabled", () => {
    expect(() =>
      validateFeatureDependencies("long_leave", true, new Set(["payroll"])),
    ).toThrow("This feature cannot be enabled until Leave Management is enabled.");

    expect(() =>
      validateFeatureDependencies(
        "long_leave",
        true,
        new Set(["leave_management", "payroll"]),
      ),
    ).not.toThrow();
  });

  it("allows valid approval mode changes", () => {
    const input = validateApprovalSettingsInput({
      approval_mode: "disabled",
      approval_workflows_enabled: false,
      reason: "Switching to direct authorized actions",
    });

    expect(input.approval_mode).toBe("disabled");
    expect(input.approval_workflows_enabled).toBe(false);
  });

  it("keeps UI preferences aligned with professional table-focused layouts", () => {
    const preferences = getDefaultUiPreferences();

    expect(preferences.layout_style).toBe("professional_list");
    expect(preferences.show_row_action_icons).toBe(true);
    expect(preferences.collapsible_sidebar).toBe(true);
    expect(preferences.avoid_bubble_card_heavy_ui).toBe(true);
  });

  it("requires a reason for approval threshold updates", () => {
    expect(() =>
      validateApprovalThresholdInput({
        amount_min: 0,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects approval threshold ranges where minimum is greater than maximum", () => {
    expect(() =>
      validateApprovalThresholdInput({
        amount_min: 500000,
        amount_max: 100000,
        reason: "Updating finance limits",
      }),
    ).toThrow("Minimum amount cannot be greater than maximum amount.");
  });
});

describe("settings access control", () => {
  it("lets Super Admin access settings when the settings feature is disabled", async () => {
    const app = appWithSettingsAccess(
      authContext({
        roleKeys: ["super_admin"],
        isSuperAdmin: true,
      }),
      "view",
    );

    const response = await app.request(
      "/settings/audit_security",
      {},
      envWithSettingsFeature(false),
    );

    expect(response.status).toBe(200);
  });

  it("blocks normal users when the settings feature is disabled", async () => {
    const app = appWithSettingsAccess(
      authContext({
        permissions: ["settings.view"],
      }),
      "view",
    );

    const response = await app.request(
      "/settings/payroll",
      {},
      envWithSettingsFeature(false),
    );
    const body = await response.json<TestErrorBody>();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FEATURE_DISABLED");
    expect(body.error.message).toBe("Settings are currently disabled.");
  });

  it("allows payroll settings view permission to view payroll settings", () => {
    expect(
      canAccessSettingsGroup(
        authContext({ permissions: ["payroll_settings.view"] }),
        "payroll",
        "view",
      ),
    ).toBe(true);
  });

  it("does not allow payroll settings view permission to view audit settings", () => {
    expect(
      canAccessSettingsGroup(
        authContext({ permissions: ["payroll_settings.view"] }),
        "audit_security",
        "view",
      ),
    ).toBe(false);
  });

  it("allows payroll settings manage permission to update payroll settings", () => {
    expect(
      canAccessSettingsGroup(
        authContext({ permissions: ["payroll_settings.manage"] }),
        "payroll",
        "manage",
      ),
    ).toBe(true);
  });

  it("does not allow attendance settings manage permission to update payroll settings", () => {
    expect(
      canAccessSettingsGroup(
        authContext({ permissions: ["attendance_settings.manage"] }),
        "payroll",
        "manage",
      ),
    ).toBe(false);
  });

  it("returns a friendly permission error when group view permission is missing", async () => {
    const app = appWithSettingsAccess(
      authContext({ permissions: ["payroll_settings.view"] }),
      "view",
    );
    const response = await app.request(
      "/settings/audit_security",
      {},
      envWithSettingsFeature(true),
    );
    const body = await response.json<TestErrorBody>();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("PERMISSION_DENIED");
    expect(body.error.message).toBe(
      "You do not have permission to view this settings group.",
    );
  });

  it("returns a friendly permission error when group manage permission is missing", async () => {
    const app = appWithSettingsAccess(
      authContext({ permissions: ["attendance_settings.manage"] }),
      "manage",
    );
    const response = await app.request(
      "/settings/payroll",
      {
        method: "PATCH",
      },
      envWithSettingsFeature(true),
    );
    const body = await response.json<TestErrorBody>();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("PERMISSION_DENIED");
    expect(body.error.message).toBe(
      "You do not have permission to manage this settings group.",
    );
  });
});


