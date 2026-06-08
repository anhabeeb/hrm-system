# Phase 13A Permission Audit Inventory

This developer-only inventory documents the access-control model verified by `npm run verify:permission-audit`.

## Scope

The audit covers backend route files, service-layer permission checks, frontend route/navigation/action guards, report/export/import/backup/archive controls, Employee 360 own-record access, seeded permissions, dangerous action confirmation/reason checks, and common sensitive-field redaction points.

## Public Route Allowlist

Only these route files may omit normal user auth by design:

- `auth.routes.ts`: login, reset, and self-account routes; authenticated subroutes use `authMiddleware`.
- `bootstrap.routes.ts`: setup status/initialize flow with bootstrap-specific safety checks.
- `health.routes.ts`: health response without business data.
- `kiosk.routes.ts`: device-authenticated kiosk flow.
- `version.routes.ts`: app version metadata only.

Device-originated biometric/device heartbeat routes must use `deviceAuthMiddleware`; normal business routes must use `authMiddleware`.

## Permission Inventory Model

The verifier builds route entries with:

- Route file, method, and route path.
- Module/action inferred from route file and HTTP verb.
- Backend permission guard or explicit public/device/service guard.
- Required seeded permission keys discovered from route, service, and frontend guard usage.
- Scope classification: company, outlet, department, employee, own-record, device, or company-admin.
- Sensitive field families likely exposed by the module.

The generated inventory is not exposed through production APIs.

## Guarded High-Risk Areas

- Data retention apply/direct archive/direct restore require `data_retention.archive` or `data_retention.restore` plus `requireReason()`.
- Backup restore apply requires `backup_recovery.restore.apply` plus `requireReason()`.
- Report export download re-checks `report_exports.download`.
- Import apply requires `imports.apply` and service-level import type/scope validation.
- Biometric/device token rotation requires explicit device-management permission plus `requireReason()`.

## Own-Record Rules

Employee 360 own-record access uses `users.employee_id` through `resolveActorLinkedEmployeeId`. Own-view permissions must not infer employees by email. Employee alert self-service requires `expiry_alerts.view_own` and a matching linked employee profile.

## Sensitive Field Controls

The verifier checks for backend redaction/omission safeguards for:

- Employee identity numbers and document storage keys.
- Payroll salary/gross/net/deduction amounts.
- Report export unsafe fields and sensitive-column permissions.
- Backup secret/raw-payload exclusion.
- Audit/notification metadata sanitization.
- Device token hash omission.

## Seed Consistency

Backend-used and frontend-used permission strings must exist in `seeds/permissions.seed.sql`. Phase 13A adds compatibility aliases instead of renaming production keys so older routes, frontend guards, and service-layer checks remain valid.

## Known Limits

The verifier is intentionally conservative. It catches common access-control drift and required Phase 13A guardrails, but it does not replace behavior-level service tests for every route/scoping branch.
