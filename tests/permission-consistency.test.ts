import { describe, expect, it } from "vitest";

import * as permissionService from "../src/services/permission.service";
import type { AuthActor } from "../src/types/api.types";

const actor = (overrides: Partial<AuthActor>): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_1",
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

describe("permission consistency", () => {
  it("keeps Super Admin as the only broad permission bypass", () => {
    expect(permissionService.hasPermission(actor({ isSuperAdmin: true, roleKeys: ["super_admin"] }), "any.permission")).toBe(true);
    expect(permissionService.hasPermission(actor({ isAdmin: true }), "any.permission")).toBe(false);
  });

  it("requires explicit permissions for non-Super Admin users", () => {
    expect(permissionService.hasPermission(actor({ permissions: ["reports.view"] }), "reports.view")).toBe(true);
    expect(permissionService.hasPermission(actor({ permissions: ["reports.view"] }), "payroll.view")).toBe(false);
  });
});

describe("permission consistency placeholders", () => {
  it.todo("all permission keys used in route middleware exist in permissions.seed.sql");
  it.todo("all feature keys used in route middleware exist in feature-settings.seed.sql and bootstrap defaults");
  it.todo("payroll reports require reports.view and payroll.view");
  it.todo("document sensitive access requires documents.view_sensitive");
  it.todo("full payroll access is required for company-wide payroll lifecycle actions");
  it.todo("approval workflow and threshold permissions match seeded approval_workflows.* and approval_thresholds.* keys");
});
