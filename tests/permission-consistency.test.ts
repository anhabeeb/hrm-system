import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import * as permissionService from "../src/services/permission.service";
import type { AuthActor } from "../src/types/api.types";
import {
  buildPermissionAuditInventory,
  extractExplicitPermissions,
  extractSeededPermissions,
  verifyPermissionAudit,
} from "../scripts/verify-permission-audit.mjs";

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

const listTypeScriptFiles = (root: string, directory: string): string[] => {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (full.endsWith(".ts")) {
        files.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(join(root, directory));
  return files;
};

describe("permission consistency", () => {
  it("keeps Super Admin as the only broad permission bypass", () => {
    expect(permissionService.hasPermission(actor({ isSuperAdmin: true, roleKeys: ["super_admin"] }), "any.permission")).toBe(true);
    expect(permissionService.hasPermission(actor({ isAdmin: true }), "any.permission")).toBe(false);
  });

  it("requires explicit permissions for non-Super Admin users", () => {
    expect(permissionService.hasPermission(actor({ permissions: ["reports.view"] }), "reports.view")).toBe(true);
    expect(permissionService.hasPermission(actor({ permissions: ["reports.view"] }), "payroll.view")).toBe(false);
  });

  it("seeds biometric/device permissions used by Phase 8C routes and frontend guards", () => {
    const root = process.cwd();
    const seed = readFileSync(resolve(root, "seeds/permissions.seed.sql"), "utf8");
    const routes = readFileSync(resolve(root, "src/routes/biometric.routes.ts"), "utf8");
    const frontend = readFileSync(resolve(root, "frontend/src/features/biometric/BiometricPage.tsx"), "utf8");

    for (const permission of [
      "biometric.resolve_punches",
      "biometric.resolve_unmatched",
      "biometric.manage_devices",
      "biometric.enable_disable_device",
      "devices.revoke",
    ]) {
      expect(`${routes}\n${frontend}`).toContain(permission);
      expect(seed).toContain(permission);
    }
  });
});

describe("Phase 13A permission audit consistency", () => {
  it("backend-used permissions are seeded", () => {
    const root = process.cwd();
    const seeded = extractSeededPermissions(root);
    const used = extractExplicitPermissions(
      ["src/routes", "src/modules"].flatMap((directory) => listTypeScriptFiles(root, directory)),
      root,
    );
    const missing = [...used.keys()].filter((permission) => !seeded.has(permission));

    expect(missing).toEqual([]);
  });

  it("frontend-used permissions are seeded", () => {
    const inventory = buildPermissionAuditInventory(process.cwd());
    const seeded = new Set(inventory.seeded_permissions);
    const missing = inventory.frontend_permissions.filter((permission) => !seeded.has(permission));

    expect(missing).toEqual([]);
  });

  it("approval workflow and threshold permissions match seeded approval keys", () => {
    const seed = readFileSync(resolve(process.cwd(), "seeds/permissions.seed.sql"), "utf8");
    for (const permission of [
      "approval_workflows.view",
      "approval_workflows.manage",
      "approval_thresholds.view",
      "approval_thresholds.edit",
      "approvals.approve",
      "approvals.override",
    ]) {
      expect(seed).toContain(permission);
    }
  });

  it("permission audit verifier passes with generated route inventory", () => {
    const result = verifyPermissionAudit(process.cwd());

    expect(result.ok).toBe(true);
    expect(result.inventory_summary.routes).toBeGreaterThan(80);
    expect(result.inventory_summary.public_allowlist).toContain("health.routes.ts");
  });
});
