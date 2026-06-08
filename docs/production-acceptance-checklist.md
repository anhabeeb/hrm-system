# Production Acceptance Checklist

Use this checklist before go-live for `hrm.cafeasiana.com.mv`. Production acceptance is a verification phase only: do not run destructive import, restore, archive, purge, or payroll finalization tests in production.

## Environment Readiness

- [ ] Cloudflare account ID is configured in `wrangler.jsonc` or through `CLOUDFLARE_ACCOUNT_ID`.
- [ ] Worker name is `hrm-system`.
- [ ] D1 binding `DB` points to the production HRM database.
- [ ] R2 bindings `DOCUMENTS_BUCKET` and `BACKUP_BUCKET` point to production buckets.
- [ ] Durable Object binding `REALTIME_ROOM` and migration for `RealtimeRoom` are configured.
- [ ] Environment variables are configured for production.
- [ ] Secrets are configured through Cloudflare secrets, not committed files.
- [ ] Frontend API base URL is same-origin `/api/v1` unless a separate API domain is intentionally used.
- [ ] `CORS_ALLOWED_ORIGINS` includes only production origins.
- [ ] Production domain `hrm.cafeasiana.com.mv` is configured and proxied correctly.
- [ ] Separate API domain `api.hrm.cafeasiana.com.mv` is configured only if the deployment intentionally separates frontend/API.
- [ ] SSL/TLS is active.
- [ ] Worker static assets route SPA paths to HTML and `/api/*` to the Worker API.

## Required Secrets

Store these with `wrangler secret put`; do not place values in D1, source, docs, logs, or ZIP archives.

- `SESSION_SECRET`
- `PASSWORD_PEPPER`
- `TOTP_ENCRYPTION_KEY`
- `DEVICE_TOKEN_SECRET`
- `BOOTSTRAP_ADMIN_TOKEN`, only during controlled bootstrap if needed
- `RESEND_API_KEY`, if email delivery is enabled
- Email provider secrets for any future provider
- Any backup/export/document storage integration secret added later

## Required Non-Secret Environment Variables

- `ENVIRONMENT=production`
- `CORS_ALLOWED_ORIGINS=https://hrm.cafeasiana.com.mv,https://www.hrm.cafeasiana.com.mv`
- `EMAIL_NOTIFICATIONS_ENABLED`
- `EMAIL_PROVIDER`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_FROM_NAME`
- `EMAIL_REPLY_TO`, if used
- `EMAIL_DRY_RUN`, expected `false` only after email acceptance
- `APP_VERSION`, if supplied by deployment
- `GIT_BRANCH`, `GIT_COMMIT_SHA`, `BUILD_TIMESTAMP`, if supplied by CI

## Cloudflare Resources

- [ ] D1 database name/id/binding: `hrm-system` / production database id / `DB`.
- [ ] R2 document bucket binding: `DOCUMENTS_BUCKET`.
- [ ] R2 backup bucket binding: `BACKUP_BUCKET`.
- [ ] Durable Object class/binding: `RealtimeRoom` / `REALTIME_ROOM`.
- [ ] Domain route: `hrm.cafeasiana.com.mv`.
- [ ] Optional API route: `api.hrm.cafeasiana.com.mv`.
- [ ] DNS is proxied through Cloudflare where expected.

## Database Readiness

- [ ] Stable backup is taken and verified before production migration.
- [ ] D1 migrations are applied once in order.
- [ ] `npm run build` schema verifiers pass.
- [ ] Permission seeds are applied and Super Admin retains all permissions.
- [ ] Bootstrap status is verified.
- [ ] No duplicate or invalid migrations are present.
- [ ] D1 migration rollback limitations are understood; some migrations may not be reversible.

## Frontend Readiness

- [ ] `npm run build` passes.
- [ ] Lazy-loaded routes open after deployment.
- [ ] Dashboard loads or redirects safely to login/setup.
- [ ] Login, 2FA, forgot/reset password, and first-time setup routes render.
- [ ] Build output has no large main bundle warning.
- [ ] No dark mode or theme switcher was introduced.

## Security Readiness

- [ ] `npm audit --audit-level=critical` passes.
- [ ] `npm run verify:security-hardening` passes.
- [ ] `npm run verify:permission-audit` passes.
- [ ] `npm run verify:no-todo-tests` passes.
- [ ] CORS is strict and does not use wildcard with credentials.
- [ ] Security headers are present.
- [ ] Session cookies are secure in production.
- [ ] Secrets are not committed.
- [ ] Export, backup, import, restore, archive, payroll, and permission-changing actions remain guarded.

## Module Acceptance

- [ ] Employees and Employee 360.
- [ ] Attendance, corrections, roster, biometric devices, and reports.
- [ ] Leave balances, requests, approvals, long leave, and holidays.
- [ ] Notifications, email notifications, and expiry alerts.
- [ ] Dashboard, HR reports, payroll reports, export, and print.
- [ ] Imports in staging; production preview only unless authorized.
- [ ] Backup create/download and restore preview.
- [ ] Data retention preview; no purge.
- [ ] Permissions, scopes, security, users, roles, and settings.

## Rollback Readiness

- [ ] Previous successful deployment is known.
- [ ] Pre-migration backup is available and retrievable.
- [ ] Rollback command/path is documented: use Cloudflare deployment rollback only to a known-good version with current route fixes.
- [ ] Migration rollback limitations are documented; prefer forward repair migrations for D1.
- [ ] Restore procedure is documented and tested in staging.
- [ ] Risky modules can be disabled or paused through settings where supported.
- [ ] Do not deploy from stale ZIP folders; Git is the source of truth.
