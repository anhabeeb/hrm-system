import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPermissionAuditInventory,
  verifyPermissionAudit,
} from "../scripts/verify-permission-audit.mjs";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("Phase 13A permission audit", () => {
  it("backend-used permissions are seeded and frontend-used permissions are seeded", () => {
    const result = verifyPermissionAudit(process.cwd());

    expect(result.ok, result.failures.join("\n")).toBe(true);
    expect(result.inventory_summary.backend_permissions).toBeGreaterThan(150);
    expect(result.inventory_summary.frontend_permissions).toBeGreaterThan(50);
  });

  it("keeps public route allowlist explicit and business routes guarded", () => {
    const inventory = buildPermissionAuditInventory(process.cwd());
    const allowlist = inventory.route_allowlist;

    expect(allowlist).toEqual([
      "auth.routes.ts",
      "bootstrap.routes.ts",
      "health.routes.ts",
      "kiosk.routes.ts",
      "version.routes.ts",
    ]);
    expect(
      inventory.route_inventory.filter(
        (route) =>
          route.backend_guard === "missing" &&
          !allowlist.includes(String(route.file).split("/").pop() ?? ""),
      ),
    ).toEqual([]);
  });

  it("dangerous action routes require permission and reason", () => {
    const dataRetention = read("src/routes/data-retention.routes.ts");
    const backupRecovery = read("src/routes/backup-recovery.routes.ts");
    const biometric = read("src/routes/biometric.routes.ts");
    const devices = read("src/routes/devices.routes.ts");

    expect(dataRetention).toMatch(/archive-jobs\/:id\/apply[\s\S]*data_retention\.archive[\s\S]*requireReason\(\)/);
    expect(dataRetention).toMatch(/items\/:sourceType\/:sourceId\/archive[\s\S]*data_retention\.archive[\s\S]*requireReason\(\)/);
    expect(dataRetention).toMatch(/items\/:sourceType\/:sourceId\/restore[\s\S]*data_retention\.restore[\s\S]*requireReason\(\)/);
    expect(backupRecovery).toMatch(/restores\/:id\/apply[\s\S]*backup_recovery\.restore\.apply[\s\S]*requireReason\(\)/);
    expect(biometric).toMatch(/rotate-token[\s\S]*biometric\.manage_devices[\s\S]*requireReason\(\)/);
    expect(devices).toMatch(/rotate-token[\s\S]*devices\.rotate_token[\s\S]*requireReason\(\)/);
  });

  it("own-record access uses linked employee enforcement", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const repository = read("src/modules/employees/employees.repository.ts");

    expect(service).toContain("resolveActorLinkedEmployeeId");
    expect(service).toContain("ensureEmployeeProfileSectionAccess");
    expect(service).toContain("expiry_alerts.view_own");
    expect(repository).toMatch(/SELECT\s+employee_id[\s\S]*FROM users[\s\S]*company_id = \?[\s\S]*id = \?/i);
  });

  it("sensitive fields are redacted or omitted", () => {
    expect(read("src/modules/employees/employees.service.ts")).toMatch(/file_key:\s*_fileKey[\s\S]*storage_path:\s*_storagePath/);
    expect(read("src/modules/employees/employees.service.ts")).toMatch(/maskValue[\s\S]*passport_number[\s\S]*work_permit_number/);
    expect(read("src/modules/payroll-reports/payroll-reports.repository.ts")).toMatch(/canViewSensitive[\s\S]*NULL[\s\S]*gross_salary/i);
    expect(read("src/modules/report-exports/report-exports.service.ts")).toMatch(/unsafeKeys[\s\S]*password_hash[\s\S]*file_storage_key/);
    expect(read("src/modules/backup-recovery/backup-snapshot.service.ts")).toMatch(/excluded_fields[\s\S]*password_hash[\s\S]*device_token[\s\S]*raw_payload/);
    expect(read("src/modules/devices/devices.service.ts")).toContain("device_token_hash: _tokenHash");
  });

  it("dashboard/report/export/import/backup/archive routes remain scoped and permission-aware", () => {
    for (const file of [
      "src/modules/dashboard/dashboard.repository.ts",
      "src/modules/hr-reports/hr-reports.repository.ts",
      "src/modules/payroll-reports/payroll-reports.repository.ts",
      "src/modules/report-exports/report-exports.service.ts",
      "src/modules/imports/imports.service.ts",
      "src/modules/backup-recovery/backup-recovery.service.ts",
      "src/modules/data-retention/data-retention.service.ts",
    ]) {
      expect(read(file), file).toMatch(/companyId|company_id/);
    }

    expect(read("src/modules/hr-reports/hr-reports.repository.ts")).toMatch(/outlet|scope/i);
    expect(read("src/modules/payroll-reports/payroll-reports.repository.ts")).toMatch(/outlet|scope/i);
    expect(read("src/modules/imports/imports.service.ts")).toMatch(/hasOutletAccess|outlet/i);
    expect(read("src/modules/data-retention/data-retention.service.ts")).toMatch(/outlet|scope/i);
  });

  it("lookup routes require explicit permissions and verifier fails if lookups.routes.ts is blanket service-guarded", () => {
    const lookups = read("src/routes/lookups.routes.ts");
    const verifier = read("scripts/verify-permission-audit.mjs");
    const serviceGuardedSet = verifier.match(/const serviceGuardedRouteFiles = new Set\(\[[\s\S]*?\]\);/)?.[0] ?? "";

    expect(serviceGuardedSet).not.toContain("lookups.routes.ts");
    expect(verifier).toContain("lookups.routes.ts must not be blanket-exempted");
    expect(lookups).toMatch(/lookupsRoutes\.get\("\/employees",\s*requireAnyPermissionOrError\(EMPLOYEE_LOOKUP_PERMISSIONS/);
    expect(lookups).toMatch(/hasBroadLookupAccess[\s\S]*linkedEmployeeId[\s\S]*id = \?/);
    expect(lookups).toMatch(/lookupsRoutes\.get\("\/payroll-periods",\s*requireAnyPermissionOrError\(PAYROLL_PERIOD_LOOKUP_PERMISSIONS/);
    expect(lookups).toMatch(/FROM payroll_items pi[\s\S]*e\.primary_outlet_id IN/);
  });

  it("frontend dangerous pages and actions use seeded permission guards", () => {
    const router = read("frontend/src/app/router.tsx");
    const nav = read("frontend/src/lib/navigation.ts");
    const exportsPage = read("frontend/src/features/report-exports/ReportExportActions.tsx");
    const importsPage = read("frontend/src/features/imports/ImportCenterPage.tsx");
    const backupPage = read("frontend/src/features/backup-recovery/BackupRecoveryPage.tsx");
    const retentionPage = read("frontend/src/features/data-retention/DataRetentionPage.tsx");

    expect(`${router}\n${nav}`).toContain("report_exports.history.view");
    expect(`${router}\n${nav}`).toContain("imports.upload");
    expect(`${router}\n${nav}`).toContain("data_retention.preview");
    expect(exportsPage).toContain("report_exports.create");
    expect(importsPage).toContain("imports.apply");
    expect(backupPage).toContain("backup_recovery.restore.apply");
    expect(retentionPage).toContain("data_retention.archive");
  });
});
