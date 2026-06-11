import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const routeAllowlist = new Set([
  "auth.routes.ts",
  "bootstrap.routes.ts",
  "health.routes.ts",
  "kiosk.routes.ts",
  "version.routes.ts",
]);

const serviceGuardedRouteFiles = new Set([
  "settings.routes.ts",
]);

const readText = (relativePath, baseDir = rootDir) =>
  fs.readFileSync(path.join(baseDir, relativePath), "utf8");

const exists = (relativePath, baseDir = rootDir) =>
  fs.existsSync(path.join(baseDir, relativePath));

const listFiles = (dir, extensions, baseDir = rootDir) => {
  const start = path.join(baseDir, dir);
  if (!fs.existsSync(start)) return [];
  const result = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        result.push(path.relative(baseDir, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(start);
  return result;
};

export const extractSeededPermissions = (baseDir = rootDir) => {
  const seed = readText("seeds/permissions.seed.sql", baseDir);
  return new Set(
    [...seed.matchAll(/'([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)'/g)].map(
      (match) => match[1],
    ),
  );
};

const extractStrings = (text) =>
  [...text.matchAll(/["']([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)["']/g)].map(
    (match) => match[1],
  );

const addPermission = (map, permission, file) => {
  if (!map.has(permission)) map.set(permission, new Set());
  map.get(permission).add(file);
};

export const extractExplicitPermissions = (files, baseDir = rootDir) => {
  const permissions = new Map();
  const arrayCallPatterns = [
    /require(?:AnyPermission(?:OrError)?|AllPermissions)\(\s*\[([\s\S]*?)\]/g,
    /(?<!\.)has(?:Any|All)Permission\([^)]*?\[([\s\S]*?)\]/g,
    /\.has(?:Any|All)Permission\(\s*\[([\s\S]*?)\]/g,
    /requiredPermissionsAny\s*:\s*\[([\s\S]*?)\]/g,
    /permissionsAny\s*:\s*\[([\s\S]*?)\]/g,
    /(?:const|let)\s+\w*Permissions\w*\s*=\s*\[([\s\S]*?)\]/g,
  ];
  const singleCallPatterns = [
    /requirePermission\(\s*["']([^"']+)["']/g,
    /(?<!\.)hasPermission\([^,]+,\s*["']([^"']+)["']/g,
    /\.hasPermission\(\s*["']([^"']+)["']/g,
    /\b(?:can|hasPayrollPermission)\(\s*["']([^"']+)["']/g,
    /requiredPermission\s*:\s*["']([^"']+)["']/g,
  ];

  for (const file of files) {
    const text = readText(file, baseDir);
    for (const pattern of arrayCallPatterns) {
      for (const match of text.matchAll(pattern)) {
        for (const permission of extractStrings(match[1])) {
          addPermission(permissions, permission, file);
        }
      }
    }
    for (const pattern of singleCallPatterns) {
      for (const match of text.matchAll(pattern)) {
        addPermission(permissions, match[1], file);
      }
    }
  }

  return permissions;
};

const routeMethodPattern =
  /\.(get|post|patch|put|delete)\(\s*["']([^"']+)["']([\s\S]*?)(?=;\s*(?:\w+Routes\.|export|\n$))/g;

const inferScope = (file, permissions) => {
  const joined = permissions.join(" ");
  if (file.includes("backup-recovery") || file.includes("data-retention")) return "company_admin";
  if (joined.includes("view_own") || file.includes("notifications")) return "company/outlet/own-record";
  if (file.includes("employees") || file.includes("attendance") || file.includes("leave") || file.includes("reports")) {
    return "company/outlet/department/employee";
  }
  if (file.includes("biometric") || file.includes("devices") || file.includes("kiosk")) return "company/outlet/device";
  return "company";
};

const sensitiveFieldsForRoute = (file) => {
  if (file.includes("payroll")) return ["salary", "gross", "net", "deductions", "bank/payment"];
  if (file.includes("employees") || file.includes("documents") || file.includes("expiry")) return ["passport/work permit/national ID", "document storage"];
  if (file.includes("backup") || file.includes("report-exports")) return ["storage keys", "sensitive export columns"];
  if (file.includes("biometric") || file.includes("devices")) return ["device tokens", "biometric payloads"];
  if (file.includes("audit")) return ["sanitized audit metadata"];
  return [];
};

export const buildPermissionAuditInventory = (baseDir = rootDir) => {
  const routeFiles = listFiles("src/routes", [".routes.ts"], baseDir).sort();
  const frontendFiles = [
    ...listFiles("frontend/src/app", [".tsx", ".ts"], baseDir),
    ...listFiles("frontend/src/features", [".tsx", ".ts"], baseDir),
    ...listFiles("frontend/src/lib", [".ts"], baseDir),
  ].sort();
  const moduleFiles = listFiles("src/modules", [".ts"], baseDir).sort();
  const seededPermissions = extractSeededPermissions(baseDir);
  const backendPermissions = extractExplicitPermissions([...routeFiles, ...moduleFiles], baseDir);
  const frontendPermissions = extractExplicitPermissions(frontendFiles, baseDir);
  const routeInventory = [];

  for (const file of routeFiles) {
    const text = readText(file, baseDir);
    const fileName = path.basename(file);
    const hasAuthGuard = text.includes("authMiddleware");
    const hasDeviceGuard = text.includes("deviceAuthMiddleware");
    const hasPermissionGuard =
      /require(?:AnyPermission(?:OrError)?|AllPermissions|Permission|AdminOrSuperAdmin|SuperAdmin|SettingsAccess)/.test(text);
    const permissions = [...(backendPermissions.get(file) ?? [])];
    const publicAllowlisted = routeAllowlist.has(fileName);
    const serviceGuarded = serviceGuardedRouteFiles.has(fileName);

    for (const match of text.matchAll(routeMethodPattern)) {
      routeInventory.push({
        file,
        method: match[1].toUpperCase(),
        route_path: match[2],
        module: fileName.replace(/\.routes\.ts$/, ""),
        action: match[1].toUpperCase() === "GET" ? "view" : "mutate",
        permissions,
        scope: inferScope(fileName, permissions),
        sensitive_fields: sensitiveFieldsForRoute(fileName),
        backend_guard: publicAllowlisted
          ? "public_allowlisted"
          : hasDeviceGuard
            ? "deviceAuthMiddleware"
            : hasAuthGuard
              ? "authMiddleware"
              : "missing",
        permission_guard:
          hasPermissionGuard || serviceGuarded || publicAllowlisted || hasDeviceGuard,
        frontend_guard: "checked by route/page/navigation verifier where applicable",
        seed_permission_exists: permissions.every((permission) => seededPermissions.has(permission)),
      });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    route_allowlist: [...routeAllowlist].sort(),
    service_guarded_route_files: [...serviceGuardedRouteFiles].sort(),
    route_inventory: routeInventory,
    backend_permissions: [...backendPermissions.keys()].sort(),
    frontend_permissions: [...frontendPermissions.keys()].sort(),
    seeded_permissions: [...seededPermissions].sort(),
  };
};

const assertContains = (failures, label, text, pattern, hint) => {
  if (!(pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern))) {
    failures.push(`${label}: ${hint}`);
  }
};

export const verifyPermissionAudit = (baseDir = rootDir) => {
  const failures = [];
  const warnings = [];
  const inventory = buildPermissionAuditInventory(baseDir);
  const seeded = new Set(inventory.seeded_permissions);
  const backendPermissions = extractExplicitPermissions(
    [...listFiles("src/routes", [".routes.ts"], baseDir), ...listFiles("src/modules", [".ts"], baseDir)],
    baseDir,
  );
  const frontendPermissions = extractExplicitPermissions(
    [
      ...listFiles("frontend/src/app", [".tsx", ".ts"], baseDir),
      ...listFiles("frontend/src/features", [".tsx", ".ts"], baseDir),
      ...listFiles("frontend/src/lib", [".ts"], baseDir),
    ],
    baseDir,
  );

  const missingBackend = [...backendPermissions.keys()].filter((permission) => !seeded.has(permission)).sort();
  const missingFrontend = [...frontendPermissions.keys()].filter((permission) => !seeded.has(permission)).sort();
  if (missingBackend.length > 0) failures.push(`Backend-used permissions missing from seeds: ${missingBackend.join(", ")}.`);
  if (missingFrontend.length > 0) failures.push(`Frontend-used permissions missing from seeds: ${missingFrontend.join(", ")}.`);
  if (serviceGuardedRouteFiles.has("lookups.routes.ts")) {
    failures.push("lookups.routes.ts must not be blanket-exempted as service guarded; each lookup endpoint needs explicit permission and scope checks.");
  }

  for (const item of inventory.route_inventory) {
    const fileName = path.basename(item.file);
    if (
      !routeAllowlist.has(fileName) &&
      item.backend_guard === "missing"
    ) {
      failures.push(`${item.file}: ${item.method} ${item.route_path} has no auth/device guard and is not allowlisted public.`);
    }
    if (
      !routeAllowlist.has(fileName) &&
      !serviceGuardedRouteFiles.has(fileName) &&
      !item.permission_guard
    ) {
      failures.push(`${item.file}: ${item.method} ${item.route_path} has no permission/service/device guard.`);
    }
  }

  const routeFilesText = {
    "src/routes/lookups.routes.ts": readText("src/routes/lookups.routes.ts", baseDir),
    "src/routes/data-retention.routes.ts": readText("src/routes/data-retention.routes.ts", baseDir),
    "src/routes/backup-recovery.routes.ts": readText("src/routes/backup-recovery.routes.ts", baseDir),
    "src/routes/imports.routes.ts": readText("src/routes/imports.routes.ts", baseDir),
    "src/routes/report-exports.routes.ts": readText("src/routes/report-exports.routes.ts", baseDir),
    "src/routes/biometric.routes.ts": readText("src/routes/biometric.routes.ts", baseDir),
    "src/routes/devices.routes.ts": readText("src/routes/devices.routes.ts", baseDir),
  };
  const lookupsText = routeFilesText["src/routes/lookups.routes.ts"];
  assertContains(failures, "lookup routes", lookupsText, /EMPLOYEE_LOOKUP_BROAD_PERMISSIONS[\s\S]*employees\.view[\s\S]*dashboard\.view[\s\S]*attendance\.view[\s\S]*leave\.requests\.create_for_employee[\s\S]*hr_reports\.view[\s\S]*payroll_reports\.view/, "employee lookup must define meaningful broad module permissions.");
  assertContains(failures, "lookup routes", lookupsText, /EMPLOYEE_LOOKUP_OWN_PERMISSIONS[\s\S]*my_profile\.view[\s\S]*leave\.requests\.submit[\s\S]*expiry_alerts\.view_own/, "employee lookup must define own-record fallback permissions.");
  assertContains(failures, "lookup routes", lookupsText, /lookupsRoutes\.get\("\/employees",\s*requireAnyPermissionOrError\(EMPLOYEE_LOOKUP_PERMISSIONS[\s\S]*hasBroadLookupAccess[\s\S]*linkedEmployeeId[\s\S]*id = \?/, "employee lookup must enforce permission and linked-employee own-only scoping.");
  assertContains(failures, "lookup routes", lookupsText, /lookupsRoutes\.get\("\/outlets",\s*requireAnyPermissionOrError\(OUTLET_LOOKUP_PERMISSIONS[\s\S]*scopedOutletClause\(context,\s*"id"/, "outlet lookup must require meaningful permissions and outlet scope.");
  assertContains(failures, "lookup routes", lookupsText, /lookupsRoutes\.get\("\/departments",\s*requireAnyPermissionOrError\(DEPARTMENT_LOOKUP_PERMISSIONS[\s\S]*employeeOutletExistsClause\(context,\s*"departments"/, "department lookup must require permissions and outlet-derived scope.");
  assertContains(failures, "lookup routes", lookupsText, /lookupsRoutes\.get\("\/positions",\s*requireAnyPermissionOrError\(POSITION_LOOKUP_PERMISSIONS[\s\S]*employeeOutletExistsClause\(context,\s*"positions"/, "position lookup must require permissions and outlet-derived scope.");
  assertContains(failures, "lookup routes", lookupsText, /LEAVE_TYPE_LOOKUP_PERMISSIONS[\s\S]*leave\.requests\.submit[\s\S]*hr_reports\.leave\.view[\s\S]*lookupsRoutes\.get\("\/leave-types",\s*requireAnyPermissionOrError\(LEAVE_TYPE_LOOKUP_PERMISSIONS/, "leave type lookup must require leave/report permissions.");
  assertContains(failures, "lookup routes", lookupsText, /PAYROLL_PERIOD_LOOKUP_PERMISSIONS[\s\S]*payroll\.view[\s\S]*payroll_reports\.view[\s\S]*payroll_reports\.summary\.view[\s\S]*payroll_reports\.employee\.view/, "payroll period lookup must require payroll/report permissions.");
  assertContains(failures, "lookup routes", lookupsText, /lookupsRoutes\.get\("\/payroll-periods",\s*requireAnyPermissionOrError\(PAYROLL_PERIOD_LOOKUP_PERMISSIONS[\s\S]*FROM payroll_items pi[\s\S]*e\.primary_outlet_id IN/, "payroll period lookup must be permission-guarded and outlet scoped for outlet users.");
  assertContains(failures, "data-retention routes", routeFilesText["src/routes/data-retention.routes.ts"], /archive-jobs\/:id\/apply[\s\S]*requirePermission\("data_retention\.archive"\)[\s\S]*requireReason\(\)/, "archive apply must require archive permission and reason middleware.");
  assertContains(failures, "data-retention routes", routeFilesText["src/routes/data-retention.routes.ts"], /items\/:sourceType\/:sourceId\/archive[\s\S]*requirePermission\("data_retention\.archive"\)[\s\S]*requireReason\(\)/, "direct archive must require archive permission and reason middleware.");
  assertContains(failures, "data-retention routes", routeFilesText["src/routes/data-retention.routes.ts"], /items\/:sourceType\/:sourceId\/restore[\s\S]*requirePermission\("data_retention\.restore"\)[\s\S]*requireReason\(\)/, "direct restore must require restore permission and reason middleware.");
  assertContains(failures, "backup-recovery routes", routeFilesText["src/routes/backup-recovery.routes.ts"], /restores\/:id\/apply[\s\S]*backup_recovery\.restore\.apply[\s\S]*requireReason\(\)/, "restore apply must require permission and reason.");
  assertContains(failures, "imports routes", routeFilesText["src/routes/imports.routes.ts"], /jobs\/:id\/apply[\s\S]*requirePermission\("imports\.apply"\)/, "import apply must require imports.apply.");
  assertContains(failures, "report export routes", routeFilesText["src/routes/report-exports.routes.ts"], /jobs\/:id\/download[\s\S]*requirePermission\("report_exports\.download"\)/, "export download must re-check download permission.");
  assertContains(failures, "biometric routes", routeFilesText["src/routes/biometric.routes.ts"], /rotate-token[\s\S]*requirePermission\("biometric\.manage_devices"\)[\s\S]*requireReason\(\)/, "biometric token rotation must require manage permission and reason.");
  assertContains(failures, "device routes", routeFilesText["src/routes/devices.routes.ts"], /rotate-token[\s\S]*requirePermission\("devices\.rotate_token"\)[\s\S]*requireReason\(\)/, "device token rotation must require rotate permission and reason.");

  const employeesService = readText("src/modules/employees/employees.service.ts", baseDir);
  const employeesRepo = readText("src/modules/employees/employees.repository.ts", baseDir);
  assertContains(failures, "Employee 360 own-record access", employeesService, "resolveActorLinkedEmployeeId", "missing linked employee helper.");
  assertContains(failures, "Employee 360 own-record access", employeesRepo, /SELECT\s+employee_id[\s\S]*FROM users[\s\S]*company_id = \?[\s\S]*id = \?/i, "linked employee must use users.employee_id scoped by company/user.");
  assertContains(failures, "Employee 360 own-record access", employeesService, "ensureEmployeeProfileSectionAccess", "missing section-specific own/scoped access helper.");
  assertContains(failures, "Employee 360 own-record access", employeesService, "expiry_alerts.view_own", "alerts tab must enforce view_own.");

  const dashboardService = readText("src/modules/dashboard/dashboard.service.ts", baseDir);
  const dashboardRepository = readText("src/modules/dashboard/dashboard.repository.ts", baseDir);
  assertContains(failures, "dashboard own expiry scope", dashboardService, "expiry_alerts.view_own", "dashboard expiry widget must recognize view_own.");
  assertContains(failures, "dashboard own expiry scope", dashboardRepository, /employee_id\s*=\s*\?/i, "dashboard expiry repository must support employee_id scoping for own alerts.");

  const sensitiveChecks = [
    ["src/modules/employees/employees.service.ts", /maskValue[\s\S]*passport_number[\s\S]*work_permit_number/, "employee identity values must be masked unless permission allows."],
    ["src/modules/employees/employees.service.ts", /file_key:\s*_fileKey[\s\S]*storage_path:\s*_storagePath/, "employee document DTO must omit storage/file keys."],
    ["src/modules/payroll-reports/payroll-reports.repository.ts", /canViewSensitive[\s\S]*NULL[\s\S]*gross_salary/i, "payroll reports must null/redact sensitive amounts without permission."],
    ["src/modules/report-exports/report-exports.service.ts", /unsafeKeys[\s\S]*metadata_json[\s\S]*password_hash[\s\S]*file_storage_key/, "report exports must block unsafe fields."],
    ["src/modules/backup-recovery/backup-snapshot.service.ts", /excluded_fields[\s\S]*password_hash[\s\S]*device_token[\s\S]*raw_payload/, "backup snapshots must exclude secrets and raw payloads."],
    ["src/modules/audit-logs/audit-logs.service.ts", /password_hash[\s\S]*secret[\s\S]*sanitize/i, "audit logs must sanitize sensitive metadata."],
    ["src/modules/devices/devices.service.ts", /device_token_hash:\s*_tokenHash/, "devices service must omit device token hashes from DTOs."],
    ["src/modules/notifications/notification-safety.ts", /password_hash[\s\S]*api_token_hash[\s\S]*redacted/i, "notification metadata must redact secrets."],
  ];
  for (const [file, pattern, hint] of sensitiveChecks) {
    assertContains(failures, file, readText(file, baseDir), pattern, hint);
  }

  const scopedRepositories = [
    "src/modules/hr-reports/hr-reports.repository.ts",
    "src/modules/payroll-reports/payroll-reports.repository.ts",
    "src/modules/report-exports/report-exports.service.ts",
    "src/modules/imports/imports.service.ts",
    "src/modules/backup-recovery/backup-recovery.service.ts",
    "src/modules/data-retention/data-retention.service.ts",
  ];
  for (const file of scopedRepositories) {
    const text = readText(file, baseDir);
    assertContains(failures, file, text, /companyId|company_id/, "company scoping signal is missing.");
    if (/reports\.repository|imports\.service|data-retention\.service/.test(file)) {
      assertContains(failures, file, text, /outlet|hasOutletAccess|outletIds|scope/i, "outlet/scope enforcement signal is missing.");
    }
  }

  const testsText = [
    "tests/permission-consistency.test.ts",
    "tests/permissions.test.ts",
    "tests/security-permissions.test.ts",
    "tests/lookups.test.ts",
  ]
    .filter((file) => exists(file, baseDir))
    .map((file) => readText(file, baseDir))
    .join("\n");
  for (const phrase of [
    "backend-used permissions are seeded",
    "frontend-used permissions are seeded",
    "normal employee cannot list company employees through /lookups/employees",
    "normal employee cannot list payroll periods through /lookups/payroll-periods",
    "outlet-scoped manager only sees allowed outlet employees",
    "payroll-period lookup requires payroll/report permission",
    "verifier fails if lookups.routes.ts is blanket service-guarded",
    "dangerous action routes require permission and reason",
    "own-record access uses linked employee enforcement",
    "sensitive fields are redacted or omitted",
  ]) {
    if (!testsText.includes(phrase)) failures.push(`tests: missing Phase 13A coverage marker "${phrase}".`);
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    inventory_summary: {
      routes: inventory.route_inventory.length,
      backend_permissions: inventory.backend_permissions.length,
      frontend_permissions: inventory.frontend_permissions.length,
      seeded_permissions: inventory.seeded_permissions.length,
      public_allowlist: inventory.route_allowlist,
    },
  };
};

export const printVerificationResult = (result) => {
  if (result.ok) {
    console.log("Permission audit verification passed.");
    console.log(
      `Inventory: ${result.inventory_summary.routes} route entries, ${result.inventory_summary.backend_permissions} backend permissions, ${result.inventory_summary.frontend_permissions} frontend permissions, ${result.inventory_summary.seeded_permissions} seeded permissions.`,
    );
    if (result.warnings.length > 0) {
      console.log("Warnings:");
      for (const warning of result.warnings) console.log(`- ${warning}`);
    }
    return;
  }

  console.error("Permission audit verification failed:");
  for (const failure of result.failures) console.error(`- ${failure}`);
  if (result.warnings.length > 0) {
    console.error("Warnings:");
    for (const warning of result.warnings) console.error(`- ${warning}`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifyPermissionAudit();
  printVerificationResult(result);
  if (!result.ok) process.exitCode = 1;
}
