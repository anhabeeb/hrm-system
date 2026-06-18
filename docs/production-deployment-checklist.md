# HRM Production Deployment and Manual QA Checklist

This checklist is the final release runbook for the Cafe Asiana HRM system. Use it before and after every production deployment that touches the Cloudflare Worker API, D1 migrations, R2-backed storage, Cloudflare Pages frontend, module toggles, leave policy rules, self-service approvals, payroll, attendance, reports, or import/export flows.

Do not paste real secrets into this document or any deployment notes. Use placeholders such as `<SESSION_SECRET>` and store real values only in Cloudflare secrets or approved secret storage.

## 1. Pre-Deployment Checks

- Confirm the release branch contains only reviewed changes.
- Confirm no emergency hotfix is pending against the current production deployment.
- Confirm the production D1 database has a recent backup before applying migrations.
- Confirm Cloudflare account access for Workers, Pages, D1, and R2.
- Confirm the production Worker, Pages project, D1 database, and R2 buckets are the intended Cafe Asiana resources.
- Confirm no stale production placeholder files exist, especially report print, backup recovery placeholder, or import/export placeholder pages.
- Confirm normal report outputs remain Excel `.xlsx` and PDF `.pdf` only.
- Confirm no real secret values are committed in documentation, source files, `wrangler.jsonc`, or environment examples.

## 2. Required Build Commands

Run these commands locally or in CI before deployment:

```bash
npm ci --no-audit --no-fund
npm --prefix frontend ci --include=dev --no-audit --no-fund
npm run typecheck
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm run build:frontend
```

Equivalent `cd frontend && npm run typecheck` and `cd frontend && npm run build` commands are safe only after frontend dependencies have been installed with `npm --prefix frontend ci --include=dev --no-audit --no-fund`.

## 3. Required Verifiers

Run the full release verifier set:

```bash
npm run verify:final-hrm-acceptance
npm run verify:leave-policy-rules
npm run verify:self-service-approval-chain
npm run verify:setup-guide
npm run verify:settings-module-lifecycle
npm run verify:module-toggles
npm run verify:module-aware-approvals
npm run verify:module-aware-alerts
npm run verify:module-aware-surfaces
npm run verify:admin-utility-pages-completion
npm run verify:production-readiness
npm run verify:migrations-production-ready
npm run verify:permission-audit
npm run verify:dashboard-personalization
npm run verify:hr-reports-schema
npm run verify:payroll-reports-schema
npm run verify:imports-schema
npm run verify:export-print-schema
npm run verify:attendance-calendar
npm run verify:payroll-schema
npm run verify:payslip-schema
npm run verify:performance-d1
```

## 4. Required Tests

Run the focused regression batches:

```bash
npm test -- leave-policy-rules.test.ts self-service-approval-chain.test.ts
npm test -- module-toggles.test.ts settings.test.ts admin-settings-pages.test.ts setup-guide.test.ts
npm test -- approval-workflow-engine.test.ts approvals.test.ts notifications.test.ts employee-self-service-dashboard.test.ts
npm test -- hr-reports.test.ts payroll-reports.test.ts imports.test.ts export-print.test.ts
npm test -- attendance-calendar.test.ts payroll.test.ts payslips.test.ts advances.test.ts salary-loans.test.ts
```

## 5. Cloudflare Worker Deployment Readiness

Record the deployment target without exposing secret values:

- Worker name: `<HRM_WORKER_NAME>`
- Environment: `<production>`
- D1 binding: `DB`
- Documents R2 binding: `DOCUMENTS_BUCKET`
- Backups R2 binding: `BACKUP_BUCKET`
- Profile photos storage: use the configured documents/profile-photo R2 path or dedicated bucket binding if enabled.
- CORS allowed origins: `<https://hrm.example.com>`
- JWT/session secret: configured with `wrangler secret put SESSION_SECRET`.
- Password pepper: configured with `wrangler secret put PASSWORD_PEPPER`.
- TOTP encryption key: configured with `wrangler secret put TOTP_ENCRYPTION_KEY`.
- Bootstrap admin token: configured with the approved bootstrap secret name for the deployment.
- Device token secret: configured with `wrangler secret put DEVICE_TOKEN_SECRET` if device/kiosk flows are enabled.
- Email/notification secret: configured with the approved provider secret, for example `<EMAIL_PROVIDER_API_KEY>`.

Worker deployment steps:

```bash
npm run build
npx wrangler deploy --env production
```

After deploy, confirm the Worker health/API smoke route responds from the production domain.

## 6. D1 Database Migration Checklist

Before applying migrations:

- Confirm D1 database name: `<HRM_D1_DATABASE_NAME>`.
- Confirm D1 database ID: `<HRM_D1_DATABASE_ID>`.
- Create or confirm a fresh D1 backup/export.
- Run `npm run verify:migrations-production-ready`.
- Review migration list and confirm no destructive migration is pending.

Apply migrations:

```bash
npx wrangler d1 migrations apply DB --remote
```

Verify migration state:

```bash
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

Spot-check important tables:

- `leave_type_policy_rules`
- setup guide progress tables
- self-service and approval workflow tables
- payroll, payslip, attendance, report export, import job, backup, audit log tables

## 7. R2 Bucket Checklist

Confirm R2 buckets exist and are bound only through the Worker:

- Documents bucket: `<HRM_DOCUMENTS_BUCKET>`
- Backups bucket: `<HRM_BACKUPS_BUCKET>`
- Profile photos: `<HRM_PROFILE_PHOTOS_STORAGE>`

R2 rules:

- Do not make employee documents, backup files, or profile photo originals publicly listable.
- Use signed or authenticated routes for private files.
- Confirm upload size limits for documents, profile photos, imports, and backups.
- Confirm backup files include manifest/checksum metadata.
- Confirm R2 object keys do not expose sensitive personal details.

## 8. Cloudflare Pages Frontend Checklist

Pages deployment settings:

- Project name: `<HRM_PAGES_PROJECT>`
- Build command: `npm --prefix frontend run build`
- Output directory: `frontend/dist`
- API base URL: `VITE_API_BASE_URL=<https://api.example.com>`
- Production domain: `<https://hrm.example.com>`
- Custom domain/DNS status: active and proxied as intended.

After Pages deployment:

- Confirm the frontend loads from the production domain.
- Confirm browser network calls target the production Worker API.
- Confirm login, dashboard, and self-service routes do not produce CORS errors.

## 9. Bootstrap and Setup Guide Manual QA

Run on a staging clone or a new production tenant before release:

1. Check fresh database bootstrap status.
2. Create the first Super Admin.
3. Log in as Super Admin.
4. Confirm `/setup-wizard` appears when setup is incomplete.
5. Configure company profile.
6. Create at least one outlet/location.
7. Create departments, including HR Department.
8. Create positions.
9. Create job levels.
10. Open Feature Modules from setup.
11. Disable Asset Tracking and Uniform Tracking during setup.
12. Enable Document Tracking.
13. Confirm disabled modules are marked `disabled_by_choice`.
14. Confirm enabled module tasks count toward setup progress.
15. Confirm setup guide deep-links into real app pages.
16. Confirm highlighted setup sections appear.
17. Finish setup.
18. Confirm the dashboard no longer shows the incomplete setup banner.

## 10. Module Toggle Manual QA

Repeat this flow for Document Tracking, Asset Tracking, Uniform Tracking, Leave Management, Long Leave Management, Duty Roster, Contract Tracking, Attendance Management, and Payroll Management:

1. Open the module's own settings page and disable it from the Module Availability section.
2. Confirm the sidebar hides the module.
3. Confirm direct route access shows a disabled-module message.
4. Confirm API actions are blocked for normal users.
5. Confirm dashboard, reports, import/export, self-service, quick actions, approvals, and alerts hide relevant items.
6. Confirm existing data is not deleted.
7. Re-enable the module.
8. Confirm previous data returns.
9. Confirm setup guide shows `needs_setup_after_enable` if the module was never configured.

## 11. Leave Policy Manual QA

FRL / Family Responsibility Leave:

1. Request 1 day FRL.
2. Confirm no supporting document is required.
3. Confirm no salary deduction is required.
4. Request 2 days FRL.
5. Confirm no supporting document is required.
6. Request 3 consecutive days FRL.
7. Confirm supporting document is required.

Sick Leave:

1. Request 1 day sick leave with used days below 15.
2. Confirm no supporting document is required.
3. Request 2 consecutive sick days below 15.
4. Confirm no supporting document is required.
5. Request 3 consecutive sick days.
6. Confirm supporting document is required.
7. Simulate used sick leave over 15 days.
8. Confirm supporting document is required.

Payroll deduction:

1. Configure sick leave deduction from Attendance Allowance.
2. Run payroll for an affected employee.
3. Confirm deduction uses allowance amount, not basic salary.
4. Confirm payroll line item metadata shows `leave_policy` source.

## 12. Self-Service Approval Chain Manual QA

1. Log in as an employee linked to an employee record.
2. Submit a leave request.
3. Open `/self/requests`.
4. Click `View Progress`.
5. Confirm the full approval chain is visible.
6. Confirm the current step is highlighted.
7. Confirm approved steps show approved.
8. Confirm future steps show waiting.
9. Confirm Finance does not appear unless configured.
10. Configure an HR-only workflow and confirm only the HR step appears.
11. Configure a multi-level workflow: Department Senior to Manager to Director to HR Senior Staff to HR Manager.
12. Confirm all configured steps appear in order.
13. Try to access another employee's approval chain.
14. Confirm access is denied.
15. Confirm approver names are privacy-safe and internal resolver debug data is not exposed.

## 13. Attendance and Roster Manual QA

1. Enable Attendance Management and disable Duty Roster.
2. Confirm attendance works without roster.
3. Enable Duty Roster and disable Attendance Management.
4. Confirm roster works without attendance overlays.
5. Disable Manual Attendance.
6. Confirm manual attendance actions are hidden.
7. Disable Kiosk Attendance.
8. Confirm kiosk pages/actions are hidden.
9. Disable Biometric Attendance.
10. Confirm biometric pages/actions are hidden.
11. Disable Attendance Corrections.
12. Confirm correction request/actions are hidden.

## 14. Payroll Manual QA

1. Enable Payroll Management.
2. Create a payroll draft.
3. Confirm salary processing works.
4. Disable payslips.
5. Confirm payslip navigation/actions are hidden.
6. Disable advances.
7. Confirm advance navigation/actions are hidden.
8. Disable salary loans.
9. Confirm salary loan navigation/actions are hidden.
10. Disable payroll approvals.
11. Confirm approval actions are hidden and payroll does not get stuck.
12. Confirm payroll reports respect enabled payroll sub-features.

## 15. Reports and Import/Export Manual QA

1. Confirm HR reports show only enabled modules.
2. Confirm Payroll reports show only enabled payroll sub-features.
3. Enable Asset Tracking and disable Uniform Tracking; confirm asset-only report works.
4. Enable Uniform Tracking and disable Asset Tracking; confirm uniform-only report works.
5. Disable both Asset and Uniform Tracking; confirm combined asset/uniform report is rejected or hidden.
6. Confirm Excel export works.
7. Confirm PDF export works.
8. Confirm CSV, Print, HTML, and `print_html` are not exposed as normal report outputs.
9. Confirm employee import preview works with `.xlsx`.
10. Confirm employee import apply works after validation.
11. Confirm disabled module templates are hidden.

## 16. Backup and Restore Manual QA

1. Create a backup.
2. Confirm backup job appears in the job table.
3. Confirm backup manifest/checksum is visible.
4. Run restore preview.
5. Confirm restore apply requires typed destructive confirmation.
6. Confirm restore does not use browser `alert`, `confirm`, or `prompt`.
7. Confirm unauthorized users cannot restore.
8. Confirm backup and restore audit logs are created.

## 17. Security, Permission, and Audit Manual QA

1. Confirm Super Admin can access all authorized administration areas.
2. Confirm HR cannot access payroll unless permission is granted.
3. Confirm Manager sees only allowed employee scope.
4. Confirm Employee sees only self-service.
5. Confirm Employee cannot access another employee's approval chain.
6. Confirm disabled modules cannot be accessed by permission alone.
7. Confirm enabled modules still require permission.
8. Confirm audit logs record backup, restore, import apply, report export, settings changes, leave policy changes, and employee photo changes.
9. Confirm session expiration gives a friendly error and returns to login.
10. Confirm CORS allows only the production frontend origin.

## 18. Post-Deployment Smoke Tests

After Worker and Pages deployment:

1. Open the production frontend domain.
2. Log in as Super Admin.
3. Confirm dashboard loads.
4. Open setup guide status if setup is incomplete.
5. Open Employees, Leave, Attendance, Payroll, Reports, Import/Export, Backup & Recovery, and Settings.
6. Submit a test leave request in staging or a controlled production test tenant.
7. Open self-service approval chain for that request.
8. Generate one Excel report and one PDF report.
9. Confirm audit logs show the expected actions.

## 19. Rollback Checklist

1. Pause additional deployment activity.
2. Keep the previous Worker deployment available.
3. Restore the previous Pages deployment if the issue is frontend-only.
4. Restore D1 only from a validated backup if the issue is migration/data related.
5. Do not roll back D1 casually without confirming backup integrity and data loss impact.
6. Disable the affected module if the issue is module-specific.
7. Use setup/module toggles as emergency mitigation when safe.
8. Review audit logs after rollback.
9. Document the incident, affected module, affected users, and recovery time.

## 20. Troubleshooting Notes

- If frontend login works locally but fails in production, check `VITE_API_BASE_URL`, CORS origins, and cookie/session settings.
- If D1 migration fails, stop deployment and inspect the failing migration before retrying.
- If reports expose CSV/Print, stop release and rerun `npm run verify:export-print-schema`.
- If setup guide progress is wrong, rerun setup recalculation and verify module toggle state.
- If leave policy preview differs from payroll result, inspect leave policy rule metadata and payroll line item metadata.
- If an employee can see another employee's self-service approval chain, treat it as a security incident and roll back or disable the affected route immediately.
- If R2 files are inaccessible, confirm binding names, bucket names, object key policy, and authenticated download route permissions.
