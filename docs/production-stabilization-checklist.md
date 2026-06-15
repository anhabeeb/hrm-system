# Production Stabilization Checklist

This checklist is for the Cloudflare Workers + D1 + R2 deployment path used by the HRM System.

## Install

- Root dependencies: `npm install`
- Frontend dependencies: `npm --prefix frontend install`

## Build

- API/type build: `npm run build:api`
- Frontend typecheck: `npm --prefix frontend run typecheck`
- Frontend production build: `npm --prefix frontend run build`
- Root frontend wrapper: `npm run build:frontend`
- Full configured build: `npm run build`

The frontend build script must remain a terminating production build: `npm run typecheck && vite build --config vite.config.mjs --configLoader native`.

## Cloudflare Configuration

- Worker entry point: `src/index.ts`
- Static assets: `frontend/dist` through the `ASSETS` binding
- D1 binding: `DB`
- D1 migrations directory: `migrations`
- R2 bindings: `DOCUMENTS_BUCKET`, `BACKUP_BUCKET`
- Durable Object binding: `REALTIME_ROOM`
- Compatibility date is configured in `wrangler.jsonc`

Store secrets with Cloudflare secrets, not source control:

- `SESSION_SECRET`
- `PASSWORD_PEPPER`
- `TOTP_ENCRYPTION_KEY`
- email/API provider secrets
- any R2 or integration credentials

## Migrations

- Local: `npm run db:migrate:local`
- Remote: `npm run db:migrate:remote`
- Smoke query: `npm run db:execute:remote`
- Production readiness verifier: `npm run verify:migrations-production-ready`

Do not deploy migrations that drop production tables, disable users/employees, mutate employee status, or auto-apply approvals.

## Verification

- Final master verifier: `npm run verify:final-production-stabilization`
- Module verifiers: run all `verify:*approval-engine` scripts listed in the final stabilization report.
- UI hardening: `npm run verify:toast-alerts`
- Permission audit: `npm run verify:permission-audit`
- No placeholder tests: `npm run verify:no-todo-tests`

## Smoke Routes

- `GET /api/v1/health` or equivalent health route if enabled
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/self/dashboard`
- `GET /api/v1/approvals/my-pending`
- `GET /api/v1/operation-ownership/setup-warnings`

Use staging data for mutating module smoke checks. Do not create production HR actions unless the data is explicitly marked as disposable.

## Rollback

- Keep the previous Cloudflare deployment available through Wrangler deployment history.
- If a migration has already run remotely, prefer a forward fix migration over a destructive rollback.
- If frontend assets regress, redeploy the last known good Worker/assets bundle.
- If an approval module is misconfigured, pause the relevant workflow/operation ownership responsibility instead of editing production history rows.
