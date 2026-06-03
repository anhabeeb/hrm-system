# HRM API Foundation

This project is the backend foundation for a Human Resource Management System built on Cloudflare Workers.

It is intentionally structured for long-term growth so future prompts can add HR modules, authentication, payroll, attendance, documents, approvals, and a React frontend without having to reorganize the codebase.

## Current scope

This prompt sets up:

- A Cloudflare Worker API in TypeScript
- Cloudflare D1, R2, and Durable Object bindings
- A versioned API base at `/api/v1`
- A health check route at `GET /api/v1/health`
- Standard response helpers and user-friendly error handling
- Request ID middleware for traceability
- Placeholder services for database, audit, notifications, and realtime events

This prompt does not implement:

- Authentication or password login
- Users or employee tables
- Business modules such as payroll, attendance, or settings
- Permission enforcement
- Full realtime WebSocket workflows
- Frontend UI

## Tech stack

- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Durable Objects
- TypeScript
- Hono for Worker routing
- Zod for shared request schema foundations

## Getting started

### 1. Install dependencies

```bash
npm install
```

Run `npm install` before `npm run dev`, `npm run typecheck`, `npm run test`, or `npm run deploy`, especially after cloning the project or after removing `node_modules`.

### 2. Review `wrangler.jsonc`

The repository uses placeholder values for:

- D1 database IDs
- R2 bucket names
- `ENVIRONMENT`

Update those values before using shared environments such as staging or production.

### 3. Add required Cloudflare secrets

Do not place secrets in code or `wrangler.jsonc`.

Add these with Wrangler:

```bash
npx wrangler secret put SESSION_SECRET --name hrm-system
npx wrangler secret put JWT_SECRET --name hrm-system
npx wrangler secret put PASSWORD_PEPPER --name hrm-system
npx wrangler secret put DEVICE_TOKEN_SECRET --name hrm-system
npx wrangler secret put TOTP_ENCRYPTION_KEY --name hrm-system
npx wrangler secret put BOOTSTRAP_ADMIN_TOKEN --name hrm-system
```

Only keep `BOOTSTRAP_ADMIN_TOKEN` while first-time setup is needed. After the first Super Admin has been created and login has been confirmed, you may remove it:

```bash
npx wrangler secret delete BOOTSTRAP_ADMIN_TOKEN --name hrm-system
```

### 4. Run locally

```bash
npm run dev
```

The API health endpoint will be available at:

```text
/api/v1/health
```

### 5. Run type checks

```bash
npm run typecheck
```

### 6. Run tests

```bash
npm run test
```

## D1 migrations

D1 migrations are ordered SQL files that create and update the database schema over time. The `migrations/` directory is the canonical source of truth for database schema in this project. Migrations should be reviewed before being applied, especially when they touch production data.

Apply local migrations:

```bash
npm run db:migrate:local
```

Apply remote migrations:

```bash
npm run db:migrate:remote
```

Back up production data before running remote migrations. Schema changes can affect important HR, payroll, attendance, and document records, so production migration work should always have a recovery path.

Never seed real passwords. Future user seed data must use invited users, disabled demo accounts, or placeholder password hash fields only. Real passwords must never be stored as plain text, seeded into SQL, or stored with reversible encryption.

Connectivity check helpers:

```bash
npm run db:execute:local
npm run db:execute:remote
```

Those execute a simple `SELECT 1 AS ok;` query so you can verify the binding is connected.

## Cloudflare production config

The production Worker configuration in `wrangler.jsonc` uses:

- Worker name `hrm-system`.
- D1 binding `DB` with database name `hrm-system`.
- D1 database ID `59ded11f-6298-4b0b-9970-6000fbd0dca1`.
- R2 binding `DOCUMENTS_BUCKET` with bucket `hrm-documents-placeholder`.
- R2 binding `BACKUP_BUCKET` with bucket `hrm-backups-placeholder`.
- Runtime variable `ENVIRONMENT=production`.
- Secrets such as `SESSION_SECRET`, `PASSWORD_PEPPER`, and `TOTP_ENCRYPTION_KEY` must be set outside `wrangler.jsonc` using Cloudflare secrets.

## First-Time Setup / Super Admin Bootstrap

Production deployment can start with no company profile and no users. The bootstrap API creates the first company, optional first outlet, and first Super Admin safely.

- `GET /api/v1/bootstrap/status` tells a future setup screen whether first-time setup is required.
- `POST /api/v1/bootstrap/initialize` creates the first company and Super Admin.
- `POST /api/v1/bootstrap/super-admin` is an alias for the same initialize flow.
- The `system_bootstrap` table tracks whether setup has completed and stores the initialized company/user IDs.
- If an existing remote D1 database is missing `system_bootstrap`, apply the latest migrations rather than wiping or re-seeding production data.
- The initialize endpoint requires `Authorization: Bearer <BOOTSTRAP_ADMIN_TOKEN>`.
- `BOOTSTRAP_ADMIN_TOKEN` must be configured as a Cloudflare secret, not committed to the repo or stored in `wrangler.jsonc`.
- Seed files must be run before bootstrap so the Super Admin role and default templates exist.
- Bootstrap works only once. After any user/company setup exists, initialize returns “Initial setup has already been completed.”
- After setup, you may delete the `BOOTSTRAP_ADMIN_TOKEN` secret if your deployment process no longer needs it.
- The first Super Admin logs in through the normal auth endpoint after setup; bootstrap does not create a session automatically.
- Do not seed real passwords into SQL files, and do not store or commit secrets.

Example:

```bash
curl -X POST "https://YOUR-WORKER.workers.dev/api/v1/bootstrap/initialize" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_BOOTSTRAP_ADMIN_TOKEN" \
  -d '{
    "company": {
      "company_name": "YOUR_COMPANY_NAME",
      "country": "MV",
      "timezone": "Indian/Maldives",
      "currency": "MVR"
    },
    "super_admin": {
      "full_name": "YOUR_SUPER_ADMIN_NAME",
      "email": "YOUR_SUPER_ADMIN_EMAIL",
      "password": "YOUR_STRONG_TEMPORARY_PASSWORD"
    },
    "outlet": {
      "outlet_name": "Head Office",
      "outlet_code": "HO",
      "is_primary": true
    }
  }'
```

## Seed files

Seed files insert safe default data after migrations have created the tables. This project uses seeds for permissions, system roles, feature settings, leave types, company settings, approval workflows, and approval thresholds.

Apply a seed file locally:

```bash
wrangler d1 execute DB --local --file seeds/permissions.seed.sql
```

Apply a seed file remotely:

```bash
wrangler d1 execute DB --remote --file seeds/permissions.seed.sql
```

Review seed files before using them in production. Seeds must not include real users, real passwords, real password hashes, private company data, or secrets. Production seed runs should happen only after migrations are applied and the target environment is confirmed.

## Authentication

The authentication module provides login, logout, current user, password reset, password change, Google Authenticator compatible TOTP 2FA, server-side sessions, and My Profile update request endpoints.

Password rules:

- Passwords must be stored only as strong one-way hashes
- The current implementation uses PBKDF2-HMAC-SHA256 with a unique salt and `PASSWORD_PEPPER`
- Cloudflare Workers currently reject PBKDF2 iteration counts above 100,000, so `PASSWORD_HASH_ITERATIONS` is clamped to the Worker-safe maximum of `100000`.
- New password hashes include metadata in the encoded value: algorithm, version, iteration count, salt, and derived hash. Verification reads the stored iteration count so older hashes can still be checked and upgraded safely after login.
- If password hashing configuration fails, the API returns `PASSWORD_HASH_CONFIGURATION_ERROR` with a request ID and suggested action instead of a generic unknown error.
- Password hashes are never returned by API responses
- Real users, passwords, and password hashes must never be seeded

Session rules:

- Session tokens are generated securely and stored in D1 only as hashes
- The browser receives the raw session token only in the `hrm_session` HttpOnly cookie
- The session cookie uses `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`
- Logging out revokes the server-side session and clears the cookie

Two-factor authentication:

- TOTP works with Google Authenticator and similar apps
- TOTP secrets are encrypted before storage using `TOTP_ENCRYPTION_KEY`
- Backup codes are shown only once and stored only as hashes

Required auth secrets:

- `SESSION_SECRET`
- `PASSWORD_PEPPER`
- `TOTP_ENCRYPTION_KEY`

My Profile behavior:

- Users can view their own account details, security status, and KYC/profile update requests
- Users can change their own password and manage their own 2FA
- Users can submit KYC/profile update requests for HR/Admin review
- Users cannot directly edit HR-controlled profile data from My Profile
- User login accounts and employee profile records are related but separate concerns

## Access Control Foundation

Backend permissions are mandatory. Frontend guards are only for user experience and must never be treated as security.

Access control layers:

- Auth middleware loads the signed-in user, roles, effective permissions, outlet access, IP address, and user agent
- Feature middleware blocks routes when a feature is disabled or unavailable
- Permission middleware enforces server-side permission keys and lets Super Admin pass normal permission checks
- Outlet access middleware restricts managers and supervisors to assigned outlets
- Record lock middleware prevents edits to locked or paid payroll periods
- Reason middleware requires a clear reason for sensitive actions
- Device auth middleware authenticates devices separately from users

Users & Access APIs:

- `/api/v1/users`, `/api/v1/roles`, and `/api/v1/permissions` are authenticated, permission-checked, and company-scoped.
- User responses return only safe profile/access fields and never expose password hashes, reset tokens, session token hashes, TOTP secrets, backup code hashes, or internal auth secrets.
- User management supports list/detail/create/update, enable/disable, password-reset-required, and role assignment with safeguards for the last active Super Admin.
- Roles and permissions endpoints expose role metadata, role permissions, user counts, and seeded permissions for the Users & Access UI permission matrix.

Approval notes:

- Approval workflows can be disabled by Super Admin later
- If approvals are disabled, approval requests are not required
- Even when approvals are disabled, sensitive actions still require a reason and audit log

Future frontend notes:

- Hide unauthorized pages and buttons for a cleaner experience
- List and table row action icons should appear only when the user has permission
- The collapsible sidebar should hide disabled or unauthorized modules
- The backend still enforces every rule even when the frontend hides actions

## Settings Engine

The Settings Engine stores configurable business rules in grouped settings instead of hardcoding HR, payroll, leave, attendance, approval, sync, and UI behavior.

Key rules:

- Settings are grouped so admin screens can show compact sections and professional table/list rows
- Settings routes enforce group-specific view and manage permissions
- Feature toggles control which modules are available
- Feature dependencies are validated before enabling related modules
- Sensitive settings changes require permission, a reason, and an audit log
- Payroll-impacting settings require an effective date and must not change locked historical payroll
- Approval workflows can be disabled by Super Admin
- If approvals are disabled, authorized Admin/Super Admin users can act directly when permitted
- Even when approvals are disabled, sensitive actions still require a reason and audit log
- Super Admin can recover settings even if the `settings` feature is disabled
- Normal users need both enabled Settings feature access and the correct group permission

Stored UI preferences support future frontend consistency:

- Professional list/table focused layout
- Avoid bubble-heavy screens
- Row action icons for quick actions
- Collapsible sidebar navigation
- Clean settings sections for switches, selects, filters, and reason/effective-date dialogs

Frontend screens should hide unauthorized or disabled settings sections for clarity, but the backend remains the final enforcement layer for permissions, feature toggles, reasons, locks, and audit rules.

## HR Master Data Modules

The HR master-data APIs provide the foundation for employees, outlets, departments, positions, salary setup history, employee document metadata, employee notes, and admin review of My Profile/KYC update requests.

Important rules:

- Employee Profile is separate from User Login
- Creating an employee does not automatically create a user account
- Employees can be local or foreign
- Foreign employee records support passport, visa, work permit, and document expiry tracking foundations
- HR/Admin manages employee data; users submit My Profile/KYC update requests instead of directly editing HR-controlled fields
- General employee edit cannot change employment status, resignation, termination, archive state, or primary outlet
- Employee status changes must use the status action, archive action, or restore action
- Employee outlet changes must use the outlet assignment action
- Employee list totals and rows are filtered by outlet access before pagination for privacy
- Archived, resigned, and terminated employees disable linked user logins and revoke active sessions
- Restoring an employee does not automatically re-enable the linked user login
- HR/Admin/Super Admin can approve, reject, or return profile update requests for more information
- Some KYC/profile update request types may require manual HR follow-up when the target field is not directly supported yet
- Sensitive employee data is permission-controlled and masked when the user lacks sensitive access
- Salary history stores money as integer minor units only; payroll calculation comes later
- Employee, salary, document metadata, notes, status, outlet, job, and KYC review changes require audit logs where sensitive

The employee list API is designed for professional HR tables with search, filters, status badges, joined outlet/department/position names, and future row action icons such as view, edit, archive, restore, documents, salary, and more actions. Future UI should use compact data tables, structured detail panels, clean filters, and avoid bubble-heavy layouts.

## Attendance + Kiosk Module

Attendance uses raw `attendance_events` for clock actions and `attendance_daily_summary` for daily HR/payroll-ready summaries. Payroll calculation comes later and should use `attendance_daily_summary`, not raw events directly.

Important rules:

- Admin/HR attendance routes are user-authenticated and permission-checked
- Kiosk routes are device-authenticated, not user-authenticated
- Kiosk devices can only access their assigned outlet
- Kiosk employee lists return safe fields only and never expose salary, documents, notes, passport, ID card, or bank details
- Manual attendance, corrections, and conflict resolution require a reason and audit logs
- Correction approval applies the requested attendance change before marking the correction approved
- Status-only manual entries are supported for records such as absent, holiday, off day, and on leave
- Manual entry can accept time-only values when an attendance date is supplied
- Correction approval checks outlet access before applying changes
- Conflict resolution checks outlet access before resolving
- Corrections that move attendance between dates or months check both the original and new payroll periods
- Unauthorized users cannot approve or resolve attendance records from outlets they cannot access
- Kiosk conflict responses clearly tell users when HR review is needed instead of showing false success
- Conflict creation is audited for both admin and kiosk flows
- Attendance event detail returns safe event, employee, and outlet fields only
- Correction, conflict, and missing punch lists return pagination metadata
- Locked or paid payroll periods block attendance edits
- Conflicts are created for wrong outlet, duplicate punch, missing clock-in/out, inactive employee, and future device warnings
- Duplicate kiosk `local_id` requests return the existing event instead of creating duplicates

Future frontend work should show attendance, corrections, and conflicts in professional list/table views with filters, status badges, compact daily summaries, and row action icons for view, correct, approve, reject, resolve, and export. Kiosk UI should stay simple and fast, and must not show HR, payroll, document, user, report, or settings pages.

## Sync Engine + Offline Attendance

The sync engine keeps D1 as the source of truth while allowing kiosk and local bridge devices to store attendance temporarily offline. Devices push attendance in batches and pull updates incrementally with sync tokens instead of downloading all data repeatedly.

Important rules:

- Device sync routes are device-authenticated and restricted to the assigned outlet
- Devices can sync attendance only; they cannot access payroll, documents, settings, users, permissions, salaries, or reports
- Offline attendance push uses batch records to reduce Worker and D1 usage
- Normal pull sync is incremental and uses `sync_changes.change_version` so devices fetch only changes after their last token
- Initial hydration is allowed only when `since = 0`; devices should not repeatedly download all employees during normal sync
- Duplicate offline records are deduped by `device_id + local_id`
- Sync conflicts are created for wrong outlet, inactive employee, missing employee, duplicate punch, payroll locked records, unsupported items, invalid payloads, and device time warnings
- Sync conflicts require HR/admin review and are listed with pagination and outlet filtering
- Device health, last seen, last sync, pending, failed, and conflict counts are tracked for admin device tables
- Payroll later can use sync blocker helpers to stop payroll when attendance sync is pending or conflicts remain unresolved
- Payroll sync blockers use the actual attendance event date/month, not the sync upload time
- Device status changes must use the enable or disable endpoints with a reason
- Device token changes must use the rotate-token endpoint and the raw token is shown only once
- Sync push responses distinguish successful batches, rejected records, and conflicts that need review
- Device heartbeat is logged for device health history and audit visibility
- Employee outlet changes create sync changes for both old and new outlets so kiosks do not keep stale employee lists
- WebSocket/realtime events should only notify clients that sync changed; REST pull fetches the actual payloads

Future UI should show sync batches, conflicts, and device health in professional tables with filters, status badges, and row action icons for retry, resolve, view, disable, rotate token, and force sync. Kiosk/offline UI and IndexedDB storage come later.

## Biometric Device Integration

Biometric support stores punch logs only. Fingerprint templates, face templates, biometric images, and base64 image/template payloads must never be uploaded or stored.

Important rules:

- Biometric devices are device-authenticated and outlet-restricted
- Biometric device status responses never expose token hashes
- Only registered active biometric devices, or explicitly approved local bridge devices, can send biometric punches
- Kiosk and tablet devices cannot call biometric punch endpoints unless explicitly registered for biometric bridge use
- Biometric batch endpoints block unauthorized devices before processing logs
- Batch audit is created only after the device passes biometric/local bridge eligibility checks
- Standard kiosk/tablet devices cannot call biometric batch endpoints unless explicitly approved as biometric/local bridge devices
- Devices can push punches directly or through a local bridge batch endpoint
- Biometric devices cannot access payroll, documents, settings, users, reports, permissions, salaries, or sensitive employee data
- Biometric user IDs must be mapped to employee profiles before punches can become attendance
- Unmatched biometric users are saved as reviewable logs and do not create attendance events
- Valid biometric punches create `attendance_events`, rebuild `attendance_daily_summary`, and create sync changes
- Locked or paid payroll periods block biometric attendance changes and create review conflicts
- Duplicate biometric punches are deduped by device event ID or biometric user/time/type key
- Device time drift over 5 minutes creates a warning but does not automatically block otherwise valid punches
- Device time drift over 30 minutes creates a review conflict
- Mapping unmatched users may save the mapping even if attendance cannot be applied because payroll is locked
- Batch responses clearly distinguish accepted, rejected, unmatched, and conflict records
- Reprocessing uses the original device event ID when available and remains idempotent
- Bridge-originated conflicts are labeled with a local bridge source
- Biometric templates and images are rejected everywhere, including punch, batch, bridge batch, unmatched map, and reprocess flows
- Admin biometric device, mapping, log, unmatched, and reprocess routes enforce permissions, outlet access, reasons where sensitive, and audit logs
- Old/new outlet sync changes prevent kiosks and biometric bridges from keeping stale employee data after employee outlet transfers

Future UI should show biometric devices, mappings, logs, and unmatched users in professional tables with filters, status badges, and row action icons for map, resolve, retry, disable, view, and sync.

## Deploy

```bash
npm run deploy
```

The root deploy script builds both the API and `frontend/dist`, then runs `wrangler deploy`. Production is configured for the preferred single-Worker hosting model:

- Workers Static Assets serves `./frontend/dist`.
- React routes such as `/dashboard`, `/employees`, and `/settings` return the SPA.
- `run_worker_first: ["/api/*"]` ensures `/api/*` always reaches the Worker API before static asset fallback.
- Unknown `/api/*` routes return structured JSON `API_ROUTE_NOT_FOUND`, never `index.html`.
- Leave `VITE_API_BASE_URL` empty for this same-origin deployment so the frontend calls `/api/v1/...`.

Before deploying, make sure you have replaced placeholder resource IDs and bucket names in `wrangler.jsonc`, added all required secrets in Cloudflare, and configured `CORS_ALLOWED_ORIGINS` for every separate frontend origin that may call the API.

## Cloudflare bindings

The Worker is configured with these bindings:

- `DB`: D1 database
- `DOCUMENTS_BUCKET`: R2 bucket for uploaded HR documents
- `BACKUP_BUCKET`: R2 bucket for backups and exports
- `REALTIME_ROOM`: Durable Object namespace for future realtime notifications
- `ENVIRONMENT`: non-sensitive runtime variable

## Required secrets

These must be configured as Cloudflare secrets:

- `SESSION_SECRET`
- `JWT_SECRET`
- `PASSWORD_PEPPER`
- `DEVICE_TOKEN_SECRET`
- `TOTP_ENCRYPTION_KEY`
- `BOOTSTRAP_ADMIN_TOKEN` only for first-time setup

Use `npx wrangler secret put <SECRET_NAME> --name hrm-system` and never put secret values in `wrangler.jsonc`, README examples, frontend env files, or committed code.

## Project structure

```text
.
├── migrations/
├── seeds/
├── src/
│   ├── app.ts
│   ├── index.ts
│   ├── config/
│   │   ├── constants.ts
│   │   ├── env.ts
│   │   └── feature-keys.ts
│   ├── durable-objects/
│   │   └── realtime-room.ts
│   ├── middleware/
│   │   ├── error.middleware.ts
│   │   └── request-id.middleware.ts
│   ├── modules/
│   ├── routes/
│   │   └── health.routes.ts
│   ├── schemas/
│   │   └── common.schema.ts
│   ├── services/
│   │   ├── audit.service.ts
│   │   ├── db.service.ts
│   │   ├── notification.service.ts
│   │   └── realtime.service.ts
│   ├── types/
│   │   ├── api.types.ts
│   │   └── env.d.ts
│   └── utils/
│       ├── crypto.ts
│       ├── dates.ts
│       ├── errors.ts
│       ├── ids.ts
│       ├── money.ts
│       └── response.ts
├── tests/
│   └── health.test.ts
├── package.json
├── README.md
├── tsconfig.json
└── wrangler.jsonc
```

## Architecture notes

- `src/app.ts` owns the main Worker app and route mounting
- `src/index.ts` is the Cloudflare Worker entrypoint and Durable Object export surface
- `src/routes/` is where HTTP endpoints live
- `src/services/` contains future database and business workflow helpers
- `src/modules/` is reserved for domain-based features such as employees, attendance, payroll, and settings
- `src/utils/` contains low-level shared helpers such as money, dates, IDs, crypto, and responses
- `src/middleware/` is where request tracing, error handling, auth, and permissions middleware will live

## Security notes

- Never store passwords as plain text
- Never store secrets in code
- Password handling must use a strong one-way hashing strategy later
- Store money as integer minor units only
- Do not calculate payroll money with floating point values
- Backend permission checks must be enforced later even if the frontend hides actions
- Error messages should stay user-friendly and avoid technical jargon in normal API responses
- API errors use a structured diagnostics shape with `code`, `title`, `message`, `requestId`, `route`, `method`, `step`, `status`, `retryable`, optional sanitized `technicalMessage`, optional `fieldErrors`, and an optional `suggestedAction`.
- The global Worker error middleware classifies validation, auth, permission, D1/database, Cloudflare binding/secret, storage, realtime, conflict, timeout, and unknown runtime failures before returning JSON.
- Production responses must never expose stack traces, secrets, passwords, API tokens, cookies, JWTs, private keys, or raw environment dumps. Server logs keep full stack/cause details behind the request ID.
- If `system_error_logs` exists, error logging is best-effort. If that write fails, the app logs to console and does not create a recursive crash.
- Non-critical side effects such as audit/activity/realtime/notification writes should be best-effort when the core action has already succeeded, unless the specific workflow marks the side effect as business-critical.
- The frontend API client normalizes structured backend errors, network failures, timeouts, and non-JSON responses into a single `ApiError` object. Forms and setup screens should show the diagnostic panel instead of replacing every failure with “Something went wrong.”
- Frontend production builds should prefer same-origin API requests with an empty `VITE_API_BASE_URL`, which resolves calls to `/api/v1/...`. Set `VITE_API_BASE_URL` only when the frontend and API are intentionally deployed on different origins.
- Network diagnostics distinguish `NETWORK_UNREACHABLE`, `API_TIMEOUT`, `CORS_BLOCKED`, `MIXED_CONTENT_BLOCKED`, `API_HTML_RESPONSE`, `INVALID_API_RESPONSE`, `API_BASE_URL_INVALID`, and structured `API_ROUTE_NOT_FOUND` responses.
- Copy Diagnostics for network failures includes request URL, API base URL/source, method, browser online state, fetch error name/message, timeout flag, CORS/mixed-content suspicion, current page URL, build version, request timestamps, and elapsed time.
- `/api/v1/health` is public, fast, D1-free, and returns JSON directly for deployment checks. `/api/v1/health/deep` can be used for basic binding/D1 diagnostics.
- Unknown `/api/*` paths return structured JSON with `API_ROUTE_NOT_FOUND` and must never fall through to the React `index.html` app shell.
- First-time setup should show actionable schema errors such as `DATABASE_MISSING_TABLE` with `technicalMessage: no such table: system_bootstrap`, failed step, request ID, and the suggested action to apply D1 migrations.
- Copy Diagnostics buttons should include request ID, code, route, step, status, retryability, title, message, safe technical detail, and suggested action so support can correlate UI reports with Worker logs.

## UI and UX direction for future prompts

The backend foundation is organized to support a professional HRM product experience later.

Future UI and API work should stay aligned to these standards:

- Prefer professional list and table based screens over chatty or bubble-heavy layouts
- Support row-level action icons for quick actions on list pages
- Keep filters clear, compact, and easy to scan
- Use readable status messages and helpful error messages
- Keep workflows simple for HR and admin users
- Support a collapsible admin sidebar in the future frontend layout
- Keep API responses consistent so tables, drawers, forms, and detail pages are easy to wire up

## Leave + Long Leave Module

The backend now includes Leave and Long Leave APIs under `/api/v1/leave` and `/api/v1/long-leave`.

- Leave types and policies are configurable, including paid/unpaid behavior, default days, attachment requirements, and payroll impact flags.
- Statutory leave types can be disabled by authorized users; Maldives leave defaults are templates, not forced hardcoded rules.
- Disabled leave types cannot be used for new leave requests, while historical leave records remain visible to authorized users.
- Leave request lists, balances, and calendars are outlet-filtered and shaped for future professional table/calendar UI with filters, status badges, and row action icons.
- Leave approvals respect configurable approval modes. If approvals are disabled or Admin/Super Admin direct approval is allowed, reason and audit logging are still required for sensitive actions.
- Approval request placeholders are created when approval workflows are required, and direct Admin/Super Admin approval skips that placeholder only when settings allow it.
- Leave actions that affect locked or paid payroll periods are blocked with user-friendly messages.
- Holiday calculations use `holiday_settings`; if holiday leave rules are disabled or holiday settings are missing, holidays use safe default behavior and do not unexpectedly change leave totals.
- Leave requests that meet the long leave trigger automatically create or link a long leave record when the `long_leave` feature is enabled.
- Updating a pending leave request above the long leave trigger also creates or links the long leave record.
- Direct long leave creation calculates salary impact preview immediately when possible, and returns a review warning when payroll locks or missing salary history prevent preview calculation.
- Long leave records prepare payroll impact without calculating payroll. The salary impact preview is month-by-month and uses integer minor units for money.
- Long leave salary impact follows the foundation rule: pay only actual worked days in the whole payroll month; if worked days are zero, payable basic salary is zero.
- Long leave days are counted only for the overlap period in each affected month, while worked days are counted across the full payroll month.
- Salary impact calculation checks every affected payroll month before writing rows, avoiding partial updates when any month is locked or paid.
- Payroll later must block if long leave salary impact is not confirmed.
- Return-to-work confirmation can move an employee from `long_leave` back to `active` and records employee status history.
- Future UI should use compact list/table views, filters, calendar panels, structured long-leave impact rows, and clear action icons rather than bubble-heavy screens.

## Payroll Engine

The Payroll Engine backend is available under `/api/v1/payroll`, with supporting foundations under `/api/v1/payslips`, `/api/v1/advances`, and `/api/v1/salary-loans`.

- Payroll calculates as a draft first and can be recalculated only while the run is editable.
- Payroll runs are company-wide by company and payroll month.
- Payroll calculation, recalculation, approval, lock, and reopen lifecycle actions require full payroll access. Outlet-filtered or outlet-limited payroll lifecycle actions are blocked until a dedicated safe partial payroll design exists.
- Outlet-limited users see only totals for accessible outlets; full-access users can see company totals.
- Payroll uses `attendance_daily_summary`, not raw attendance events, as the attendance source for payroll decisions.
- Payroll uses confirmed `long_leave_salary_impacts`; unconfirmed or missing long leave impact creates blocking payroll exceptions.
- Payroll lock checks attendance sync blockers, unresolved sync conflicts, attendance conflicts, pending corrections, missing punches, missing attendance summaries, long leave confirmation, missing salary history, and critical payroll exceptions.
- Salary basis settings are supported for `fixed_30_days`, `calendar_days`, `working_days`, and `custom_days`.
- Payroll items include salary history, attendance deductions, approved leave and unpaid leave, confirmed long leave impact, approved advances, salary loan installments, asset deductions, and configurable placeholder behavior for future earnings.
- Money is stored as INTEGER minor units.
- Locked payroll cannot be recalculated or changed unless reopened through the reopen workflow.
- Lock fields are changed only by lock/reopen actions; approve and reject do not mutate `locked_by` or `locked_at`.
- Approval workflows can be disabled; Admin/Super Admin direct approval is allowed only when settings and permissions allow it.
- Payslip PDF generation is a later step; this module creates payslip metadata and a friendly download placeholder.
- Payslip batch generation respects outlet access; limited users generate only accessible outlet payslips.
- Payroll export is currently a metadata/JSON foundation, not a real Excel/PDF export file, and export scope is outlet-filtered for limited users.
- Outlet-limited users can view/export/generate payslips only for accessible outlet items, but cannot submit, approve, reject, lock, reopen, or approve reopen for company-wide payroll.
- Salary loan schedule changes are blocked if they affect locked or paid payroll months.
- Salary loan approval is idempotent and cannot create duplicate installment schedules.
- Salary loan list APIs support `start_month` filtering, and advance list APIs support `date_from` / `date_to` filters against paid date; filtered rows and counts keep outlet-access protection.
- Future payroll UI should use professional tables, filters, status badges, compact summaries, row action icons, and payroll flow steps rather than bubble-heavy screens.

## Approval Workflow Engine

The Approval Workflow Engine is available under `/api/v1/approvals`.

- Approval requests are user-authenticated and feature-gated; device-authenticated kiosk, sync, and biometric callers cannot access approval routes.
- Approval route permissions use seeded permission keys: workflow management uses `approval_workflows.view`/`approval_workflows.manage`, and threshold management uses `approval_thresholds.view`/`approval_thresholds.edit`.
- Approval modes support `disabled`, `manual`, `auto_admin_superadmin`, and `full_workflow`; if approval settings are missing, the safe seeded default is Admin/Super Admin direct approval.
- Approval lists, details, pending counts, and histories are paginated or table-friendly and apply outlet access protection.
- No-outlet and company-level approval requests can be viewed or acted on by eligible current-step approvers, the requester for view-only access, or Super Admin. They are not exposed to unrelated users with generic view permission.
- Static approval routes such as settings, workflows, and thresholds are registered before approval request `/:id` routes.
- Requesters cannot approve, reject, or return their own approval requests.
- Terminal approval requests cannot be acted on again.
- Workflow steps enforce required role and permission keys; users receive a friendly message when a request is waiting for a different approval step.
- Sensitive workflow changes such as workflow key, module, approval mode, or enabled status require a reason.
- Workflow steps cannot share a duplicate `step_order`, and workflow keys cannot be renamed while open approval requests exist.
- Approval thresholds are applied during approval request creation when amount/currency metadata matches an active threshold. Threshold role/permission metadata further restricts who can approve that step.
- Super Admin override is supported for approve/reject decisions, requires a reason, writes a high-severity audit log, and does not bypass hard business locks owned by target modules.
- Workflow configuration supports create, update, enable, disable, and step CRUD with audit logs.
- Threshold configuration supports create, update, enable, disable, and history rows for policy review.
- Approval action audit logging is recorded before approval status mutations, and action/status changes are batched together to avoid completed approvals without audit history.
- Target-module integration is intentionally conservative: approvals record the decision and return a clear note when the target module must safely apply the approved change itself. The approval engine does not bypass payroll locks, salary-loan schedule protections, asset deduction locks, or document sensitivity/file-key rules.
- Realtime placeholder events send only small status notifications and do not include sensitive approval payloads.
- Future UI should use professional tables with filters, status badges, history drawers, and row action icons for approve, reject, return, override, view, and configuration actions.

## Assets, Uniforms, and Documents

The Assets, Uniforms, and Documents backend is available under `/api/v1/assets`, `/api/v1/uniforms`, and `/api/v1/documents`.

- Assets can be created, edited, assigned to employees or outlets, returned, marked lost, or marked damaged through dedicated action endpoints.
- Asset status changes are blocked through general PATCH requests; HR/Admin users must use the action buttons/endpoints so transitions stay auditable.
- Pending asset returns and pending uniform returns are exposed for future offboarding and final settlement checks.
- `/assets/pending-return` includes issued, lost, and damaged assigned assets that have not been returned.
- Lost or damaged assets can create deduction requests. Deductions affect payroll only after approval or authorized direct action.
- Asset deduction requests validate integer minor-unit money amounts and block known locked or paid payroll months.
- Approved asset deductions can be picked up by payroll for the matching stored deduction month when a month is supplied.
- `/uniforms/issue` supports `outlet_id` and validates it against the employee's assigned outlet. Uniform issue and return are tracked with quantity, issue date, return date, employee outlet access, reason, and audit logs.
- Documents are stored in Cloudflare R2, while metadata is stored in D1. File content is never stored in D1.
- `/documents/upload` requires actual file content until multipart upload is implemented. The system must not create zero-byte `valid` R2 files.
- `/documents/:id/download` returns the actual file response when available, with private no-store headers.
- Document API responses do not expose private R2 `file_key` values.
- `file_key` is never exposed in public document API responses.
- Sensitive documents require `documents.view_sensitive` for view and download access.
- Document view/download/update/delete actions create document access logs where relevant, and sensitive/document-changing actions create audit logs.
- Document metadata changes to document type, expiry date, status, or sensitivity require a reason.
- Document deletion requires a reason and soft-deletes the metadata by default.
- `text/plain` is not an allowed document type; accepted files are limited to common PDF, image, Word, and Excel document formats.
- Document categories support compliance requirements such as foreign/local employee applicability and expiry-date requirements.
- Expiring and missing document endpoints support HR compliance tracking with outlet-filtered results.
- Device-authenticated kiosk, sync, and biometric callers cannot access assets, uniforms, or documents because these routes require user authentication.
- Future UI should use professional list/table views with filters, status badges, compact detail panels, and row action icons for view, assign, return, download, delete, mark lost/damaged, and approve/reject deduction actions.

## Reports, Import/Export, Backup & Recovery

The reporting, import/export, and backup foundations are available under `/api/v1/reports`, `/api/v1/import-export`, and `/api/v1/backup-recovery`.

- Reports are generated from existing D1 source-of-truth tables and are shaped for professional table/dashboard UI later.
- Required Prompt 15 compatibility routes are available: `/api/v1/backup-recovery/backups/create`, `/api/v1/backup-recovery/restore/requests/:id`, and `/api/v1/import-export/templates/:templateKey`.
- Report access requires `reports.view` plus the module-specific permission, such as `payroll.view`, `documents.view`, or `attendance.view`.
- Report counts and rows are outlet-filtered where employee, attendance, leave, payroll, asset, document, device, sync, audit, and dashboard records are returned.
- The missing-documents report reuses the same required-document/category applicability foundation as the documents module.
- Asset and document summaries include richer status, missing, pending return, deduction, outlet, and type counts where implemented.
- Sensitive document file names are masked unless the actor has `documents.view_sensitive`; document report/export responses never expose `file_key`.
- Sensitive report/export values are masked where practical, and sensitive report generation creates audit logs.
- Export jobs require export permission plus the source module permission. Sensitive exports require a reason and `export.sensitive` or Super Admin access.
- Export jobs support safe JSON/CSV foundations and store generated files in the configured `BACKUP_BUCKET`; API JSON responses do not expose private storage keys.
- Export job detail/download respects stored outlet scope. Outlet-limited users cannot download company-wide exports.
- Outlet-limited users can view or download only their own export jobs, and the stored `filters_json` scope is checked against their current outlet access.
- Export cancel/retry actions use the same requester and outlet-scope rules as detail/download.
- Outlet-limited users can cancel or retry only their own outlet-scoped exports; company-wide exports can be changed only by Super Admin/full export users.
- Export cancel is allowed only for `queued` or `processing` jobs, and retry is allowed only for `failed` jobs.
- Blocked cancel/retry attempts do not create success audit logs or change export status.
- Supported import types are `employees`, `attendance_manual`, `leave_balances`, `assets`, `uniforms`, and `documents_metadata`; legacy aliases normalize to these Prompt 15 names where supported.
- Import upload requires a reason and safely rejects missing, invalid, empty, or oversized base64 content before writing R2 objects or metadata.
- Import apply is currently a safe placeholder unless the service returns `applied: true`; the API does not claim business data was imported when no data was changed.
- Import jobs support upload, validation, and apply placeholders. Validation records row counts, while apply remains non-destructive until module-specific importers are implemented.
- Import/export routes are user-authenticated and feature-gated; device-authenticated kiosk/sync/biometric callers cannot access them.
- Backup jobs create safe metadata snapshots in R2 via `BACKUP_BUCKET`; snapshots exclude passwords, token hashes, TOTP secrets, raw document files, and other secret material.
- “Backup completed successfully.” is returned only after a backup file is generated and uploaded to `BACKUP_BUCKET`; queued metadata-only paths should use “Backup job created successfully.”
- Backup detail responses never expose private `storage_location` values, while download endpoints return private no-store file responses for authorized users.
- Restore requests are metadata-only placeholders in this prompt. Detail views return safe metadata only and do not restore production data.
- Retention policy metadata can be viewed and updated for future scheduled backup cleanup.
- Future UI should use dashboard summaries, list/table views, filters, status badges, export/import job drawers, backup history tables, and row action icons for generate, download, validate, apply, verify, approve, reject, and retry actions.

## Frontend Foundation

Prompt 17 adds a separate `frontend/` React + TypeScript + Vite application for the HRM admin dashboard.

- The frontend uses Tailwind CSS and shadcn/ui-compatible components.
- The theme is a fresh professional light theme only; there is no dark mode, no theme switching, and no dark mode toggle.
- The layout follows an Enterprise HRM Admin Dashboard style with a table-first list/detail foundation.
- The authenticated shell includes a collapsible sidebar, mobile navigation sheet, topbar, breadcrumbs, and wide admin content area.
- Sidebar navigation is permission-aware and feature-aware. Backend permissions remain the real security boundary.
- Module routes are also guarded by permission and feature checks, so direct URLs show a professional denied state when access is missing.
- Every sidebar item has a matching placeholder route to avoid falling through to the generic fallback.
- Navigation uses backend seeded feature keys exactly: Kiosk Devices and Sync Status use `offline_sync`, Assets and Uniforms use `assets_uniforms`, and the future dedicated kiosk punch screen can use `kiosk_attendance`.
- Import / Export navigation uses the seeded `export.view` or `import.view` permissions rather than frontend-only job keys.
- Reusable UI foundations include data tables, toolbars, filters, pagination, row action icons, detail sections, drawers, confirmation dialogs, inline alerts, status badges, loading states, and empty states.
- API calls use `VITE_API_BASE_URL` when configured and otherwise default to same-origin `/api/v1`.
- The API client parses the backend standard response shape, preserves `request_id`, and throws typed user-friendly errors without stack traces or internal debug payloads.
- Auth state is ready for `/auth/login`, `/auth/logout`, `/auth/me`, 2FA verification, and password reset endpoints.
- Login-time 2FA is verified by resubmitting `/auth/login` with `totp_code`; `/auth/2fa/verify` is reserved for authenticated 2FA management screens.
- Pending 2FA email/password credentials are kept in React memory only and are never stored in `localStorage`, `sessionStorage`, URLs, or logs.
- First-time setup routing calls `/bootstrap/status` and shows `/setup` when initialization is required.
- The setup UI posts to `/bootstrap/initialize`; the bootstrap token is entered only during setup, sent as an Authorization Bearer header, and never stored.
- Setup creates the company, first Super Admin, and optional first outlet, then redirects to login without auto-login.
- After successful setup, the frontend updates the bootstrap status cache to `setup_required = false` before redirecting so users do not bounce back to `/setup`.
- Forgot/reset password screens use the backend `/auth/forgot-password` and `/auth/reset-password` routes with safe generic reset messaging.
- Dashboard connects to `/reports/dashboard/summary` and renders partial permission-scoped data safely.
- Dashboard remains available to authenticated users; if the signed-in user lacks `reports.view`, it shows “Dashboard summary is not available for your role.” and points them to modules available in the sidebar.
- Dashboard permission denial is handled separately from network/server errors, which still show the retryable “Dashboard data could not be loaded.” state.
- My Profile is read-only for official fields; users request profile/KYC updates instead of directly editing official employee data.
- 2FA management lives under `/profile/security`; setup secrets and backup codes are not persisted in browser storage.
- Employees UI is implemented with backend-aligned `/employees` API calls, backend pagination, URL filters, table-first list/detail layouts, create/edit dialogs, and permission-aware salary/document/note panels.
- Users & Access UI is connected to live `/users`, `/roles`, and `/permissions` APIs and uses backend data for user lists, role lists, and the permission matrix.
- Outlets, Departments, and Positions UI are implemented with backend-aligned APIs, compact tables, filters, detail drawers, and create/edit dialogs.
- Settings UI foundation is implemented with Company, Features, Attendance, Leave, Payroll, Approvals, Documents, and Backup sections. Feature settings use real backend feature endpoints and require a shadcn dialog reason for changes; `window.prompt` is not used.
- Prompt 19 module pages use shadcn/ui, Tailwind CSS, TanStack Query, table-first Enterprise HRM Admin Dashboard patterns, permission-aware actions, and feature-aware routes.
- The frontend remains a light theme only. There is no dark mode, no theme switching, and no dark mode setting.
- Prompt 20 implements the Attendance UI, Kiosk Devices UI, Sync Status UI, and Biometric UI using the same shadcn/ui, Tailwind CSS, light-only Enterprise HRM Admin Dashboard style.
- Attendance now has table-first tabs for daily summaries, raw events, corrections, and conflicts, with URL-backed filters, backend pagination, detail drawers, reason dialogs, and locked-payroll error handling.
- The Attendance Summary endpoint now uses the standard paginated API shape with top-level `data` and `pagination`; it no longer returns nested `data.rows`.
- The Attendance Events tab uses `GET /api/v1/attendance/events` for raw attendance events, which is separate from daily summaries returned by `/attendance` and `/attendance/summary`.
- Kiosk Devices now has a table-first fleet view, device registration, enable/disable, rotate-token dialogs, health summary integration, and permission-aware row actions.
- Kiosk Devices uses the `offline_sync` feature guard because it calls backend `/devices` APIs; the future dedicated kiosk punch screen can use `kiosk_attendance`.
- Sync Status now has status summaries, batch and conflict tables, sanitized detail drawers, force-resync and resolve-conflict dialogs, and a safe placeholder for sync item listing because no admin `/sync/items` endpoint exists yet.
- Biometric now has tabs for devices, employee mappings, punch logs, and unmatched biometric users, with mapping/reprocess dialogs and sanitized raw-safe log detail.
- Device tokens are shown only once when returned by register/rotate responses, are kept only in temporary component state, and are never stored in `localStorage` or `sessionStorage`.
- Device token hashes, API token hashes, R2/file keys, sync secret payloads, and biometric template/image fields are redacted before display and must never be rendered.
- Device health and sync report summaries are permission-aware; a 403 summary does not break the main device/sync tables.
- The kiosk punch screen remains a future placeholder; Prompt 20 does not implement device token login or a standalone kiosk punch app.
- Prompt 21 implements Leave, Long Leave, Payroll, Payslips, Advances, and Salary Loans as light-only shadcn/Tailwind, table-first admin screens with backend pagination, URL-backed filters, detail drawers, status badges, and permission-aware row actions.
- Leave UI supports leave requests, balances, calendar-style summaries, leave type/policy visibility, create dialogs, balance adjustments, and approve/reject/cancel reason dialogs without `window.prompt`.
- Long Leave UI supports record lists, salary-impact month rows, salary-impact confirmation, approve/reject actions, and return-to-work confirmation with locked-payroll friendly errors.
- Payroll UI supports draft calculation, recalculation, run review, items, exceptions, lifecycle actions, payroll flow steps, and reason dialogs. Company-wide lifecycle actions remain backend-enforced for full payroll access.
- Payroll row actions are permission-aware: users with only `payroll.view` cannot see or trigger recalculate, submit/review, approve, reject, lock, request reopen, or reopen actions.
- Payslips UI supports outlet-scoped batch metadata generation and a safe PDF download placeholder; no real PDF file generation is implemented in the frontend.
- Payslip download placeholder actions require `payslips.download`; users with only `payslips.view` can view payslip metadata but cannot trigger downloads.
- Advances and Salary Loans UI submit money as integer minor units, expose approval/pause/settle workflows with required reasons, and surface locked-period errors in HR-friendly language.
- Salary Loans support backend `start_month` filtering with the same outlet-filtered list/count behavior as other loan filters.
- Advances support backend and frontend `date_from` / `date_to` filters against paid date, and request creation now shows “Advance payment requested successfully.”
- Prompt 22 implements Assets, Uniforms, Documents, and Approvals UI using the same shadcn/ui light-only Enterprise HRM Admin Dashboard style.
- Assets UI includes assets, assignments/pending returns, lost/damaged actions, and asset deductions with permission-aware row actions and locked-payroll deduction error handling.
- Uniforms UI includes issue and pending-return tables with issue/return dialogs and seeded `uniforms.issue` / `uniforms.return` action visibility.
- Documents UI includes document register, expiring documents, missing documents, and categories foundation. Document file keys, R2 object keys, and private storage paths are never rendered.
- Sensitive document names are masked unless the user has `documents.view_sensitive`, and document upload converts file content to base64 only at submit time and clears the selected file after submit.
- Approvals UI includes approval inbox, safe detail/history drawer, action dialogs, workflow/step management foundation, threshold foundation, and settings summary.
- Approval actions require both the seeded frontend permission and backend `can_*` flags; approval payloads are recursively sanitized before display.
- Prompt 22 tab queries are permission-aware and active-tab-aware: Assets Deductions loads only with `assets.approve_deduction`, Uniform Pending Returns only with `uniforms.pending_return`, Document Expiring only with `documents.view_expiring`, Document Missing only with `documents.view_missing`, Approval Workflows only with `approval_workflows.view`, and Approval Thresholds only with `approval_thresholds.view`.
- Main route-level tabs remain available to users with the page view permission, while protected hidden tabs do not call unauthorized endpoints or create avoidable generic 403 page errors.
- Assets, Uniforms, Documents, and Approvals stay table-first with URL filters, backend pagination, status badges, detail drawers, row action icons, and no dark mode or theme switcher.
- The remaining frontend UI completion pass implements Reports, Import/Export, Backup & Recovery, and template/notification foundations using the same shadcn/ui light-only Enterprise HRM Admin Dashboard style.
- Reports UI includes catalog, generate, HR, attendance/leave, payroll, compliance, audit activity, device health, sync status, and template foundation tabs. Protected report tabs are permission-aware and do not call unauthorized endpoints.
- Reports HR, asset, attendance, and leave sections only query their endpoints when the user also has the matching module permission (`employees.view`, `assets.view`, `attendance.view`, or `leave.view`), and unavailable sections show role-aware placeholders instead of generic 403 errors.
- Compliance reports are split by document summary, expiring documents, and missing documents permissions. Expiring/missing report sections honor the granular document permissions when seeded.
- Import/Export UI includes export jobs, import jobs, import upload/validation/apply placeholder flows, and import templates. Export/download actions never expose `file_key`, and import apply does not claim data was imported unless the backend returns `applied=true`.
- Import upload requires a reason client-side and clears selected file, reason, local errors, and generated content after success or close. Sensitive export types require a reason before submission.
- Backup & Recovery UI includes backup status, backup jobs, retention policy, and restore request review. Restore requests do not execute destructive production restore from the frontend.
- Backup creation messages depend on returned status/file readiness, and Backup & Recovery sidebar visibility uses the same any-permission logic as the route guard.
- PDF/export template and notification template foundations are table-first placeholders only. Real PDF rendering, export formatting, email/SMS provider integration, and send actions are future work.
- Reports, Import/Export, Backup/Recovery, and template areas defensively sanitize file/R2 keys, token/hash/secret/password fields, provider keys, and sensitive payloads before display.
- Hidden unauthorized tabs across the frontend do not call protected APIs; route-level main tabs remain available when the user has the relevant view permission.
- Future UI should continue using professional tables, compact filters, status badges, detail drawers, and row action icons rather than bubble-heavy record cards.

Frontend run commands:

```bash
cd frontend
npm install
npm run dev
npm run build
npm run typecheck
```

When preparing a ZIP or handoff bundle, exclude `.git/`, `.wrangler/`, `node_modules/`, `frontend/node_modules/`, `frontend/dist/`, `.env`, `.env.*`, `.dev.vars`, logs, and temporary text files.

## Production Readiness Checklist

Use this checklist before frontend integration or production smoke testing.

1. Install dependencies with `npm install`.
2. Run `npm run typecheck` and `npm test`.
3. Review `wrangler.jsonc` before deploy. It should keep `name = hrm-system`, `main = src/index.ts`, `ENVIRONMENT = production`, D1 binding `DB`, R2 bindings `DOCUMENTS_BUCKET` and `BACKUP_BUCKET`, and the `REALTIME_ROOM` Durable Object binding.
4. Create or verify the D1 database binding. The configured production database is `hrm-system` with database id `59ded11f-6298-4b0b-9970-6000fbd0dca1`.
5. Create or verify R2 buckets for documents and backups. R2 object keys are internal only and must not be exposed through JSON APIs.
6. Set Worker secrets with `npx wrangler secret put --name hrm-system`: `SESSION_SECRET`, `JWT_SECRET`, `PASSWORD_PEPPER`, `DEVICE_TOKEN_SECRET`, `TOTP_ENCRYPTION_KEY`, and `BOOTSTRAP_ADMIN_TOKEN` only for first setup.
7. Apply D1 migrations remotely in order with the configured `migrations` directory.
8. Run seed files remotely after migrations. Seeds must not contain real users, plaintext passwords, password hashes, or production secrets.
9. Deploy the Worker.
10. Check `/api/v1/health`.
11. Check `/api/v1/bootstrap/status`.
12. If setup is required, run bootstrap initialize with the bootstrap token.
13. Delete or rotate `BOOTSTRAP_ADMIN_TOKEN` after first setup if desired.
14. Log in as the first Super Admin.
15. Verify a protected endpoint rejects unauthenticated requests and works with a valid Super Admin session.
16. Verify `DOCUMENTS_BUCKET` upload/download access with a safe test document.
17. Verify `BACKUP_BUCKET` access with a safe metadata backup/export test.
18. Verify audit logs are created for sensitive actions.
19. Verify `.git/`, `.wrangler/`, `.dev.vars`, `.env*`, `node_modules/`, logs, and secrets are not included in ZIP uploads or commits.
20. Start frontend integration only after backend smoke tests pass.

Production safety reminders:

- Do not commit secrets or `.dev.vars`.
- Do not seed real passwords or real personal data.
- The D1 `database_id` is not a password, but still treat production configuration carefully.
- Employee document API responses never expose `file_key`; R2 object keys are internal only, and sensitive document names are masked unless the caller has `documents.view_sensitive`.
- Uploaded ZIPs should exclude `.git`, `.wrangler`, `node_modules`, `frontend/node_modules`, `frontend/dist`, and temporary text files.
- Payroll locked or paid periods cannot be changed without the proper reopen flow.
- Sensitive exports require a reason and the correct sensitive export permission or Super Admin access.
- Bootstrap is one-time only and cannot run after setup is completed.

## Final Release Checklist

Use this checklist for the final production handoff.

### Repository Packaging

- Remove temporary files such as `New Text Document.txt`, local logs, scratch files, and generated build output.
- Do not commit `.env`, `.env.*`, `.dev.vars`, `.wrangler/`, `.mf/`, local SQLite/Miniflare state, `node_modules/`, or `frontend/dist/`.
- Do not commit secrets, Cloudflare API tokens, password hashes, TOTP secrets, device token hashes, R2 object keys, or real personal data.
- Package ZIPs with exclusions similar to:

```bash
zip -r "HRM System.zip" . \
  -x ".git/*" \
  -x ".wrangler/*" \
  -x "node_modules/*" \
  -x "frontend/node_modules/*" \
  -x "frontend/dist/*" \
  -x ".dev.vars" \
  -x ".env" \
  -x ".env.*" \
  -x "*.log" \
  -x "New Text Document.txt"
```

### Cloudflare Configuration

- Confirm Worker name `hrm-system`.
- Confirm Worker entrypoint `src/index.ts`.
- Confirm `ENVIRONMENT=production`.
- Confirm D1 binding `DB`, database name `hrm-system`, database ID `59ded11f-6298-4b0b-9970-6000fbd0dca1`, and migrations directory `migrations`.
- Confirm R2 bindings `DOCUMENTS_BUCKET=hrm-documents-placeholder` and `BACKUP_BUCKET=hrm-backups-placeholder`.
- Confirm Durable Object binding `REALTIME_ROOM` and the `RealtimeRoom` migration remain present.
- Set required Worker secrets:

```bash
npx wrangler secret put SESSION_SECRET --name hrm-system
npx wrangler secret put JWT_SECRET --name hrm-system
npx wrangler secret put PASSWORD_PEPPER --name hrm-system
npx wrangler secret put DEVICE_TOKEN_SECRET --name hrm-system
npx wrangler secret put TOTP_ENCRYPTION_KEY --name hrm-system
npx wrangler secret put BOOTSTRAP_ADMIN_TOKEN --name hrm-system
```

- Optional/future provider secrets such as email provider API keys, SMS provider API keys, or external biometric bridge tokens must also be configured only as Cloudflare secrets when those integrations exist.

### D1 Migration And Seed Runbook

1. Install dependencies with `npm install`.
2. Confirm `wrangler.jsonc` points to the intended production Worker, D1 database, R2 buckets, and Durable Object binding.
3. Optionally apply migrations locally first with `npx wrangler d1 migrations apply hrm-system --local`.
4. Apply migrations remotely with `npx wrangler d1 migrations apply hrm-system --remote`.
5. Verify the setup-state table exists after migrations:

```bash
npx wrangler d1 execute hrm-system --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='system_bootstrap';"
npx wrangler d1 execute hrm-system --remote --command "SELECT * FROM system_bootstrap;"
```

6. Run seed SQL remotely in this order:

```bash
npx wrangler d1 execute hrm-system --remote --file seeds/permissions.seed.sql
npx wrangler d1 execute hrm-system --remote --file seeds/roles.seed.sql
npx wrangler d1 execute hrm-system --remote --file seeds/feature-settings.seed.sql
npx wrangler d1 execute hrm-system --remote --file seeds/company-settings.seed.sql
npx wrangler d1 execute hrm-system --remote --file seeds/leave-types.seed.sql
npx wrangler d1 execute hrm-system --remote --file seeds/approval-workflows.seed.sql
npx wrangler d1 execute hrm-system --remote --file seeds/approval-thresholds.seed.sql
```

7. Verify the Super Admin role exists.
8. Verify core frontend/backend permissions exist.
9. Verify feature defaults exist for `employee_management`, `user_management`, `settings`, `attendance`, `offline_sync`, `kiosk_attendance`, `biometric_attendance`, `leave_management`, `long_leave`, `payroll`, `payslips`, `assets_uniforms`, `documents`, `approvals`, `reports`, `import_export`, `backup_recovery`, and `audit_logs`.
10. Verify document categories, leave types, approval workflows, and settings defaults exist.
11. Do not seed real users, passwords, password hashes, private company data, or secrets. Create the first Super Admin through bootstrap only.

### Bootstrap First-Time Setup Runbook

1. Deploy the backend Worker.
2. Set `BOOTSTRAP_ADMIN_TOKEN` as a Worker secret.
3. Visit the frontend `/setup` page or call `GET /api/v1/bootstrap/status`.
4. If `setup_required=true`, complete setup through the UI or call `POST /api/v1/bootstrap/initialize` with placeholder-safe payload values.
5. Create the company profile, first Super Admin, and optional first outlet.
6. Confirm setup succeeds and redirects to `/login`.
7. Log in as the first Super Admin.
8. Confirm `GET /api/v1/auth/me` works after login and a protected endpoint rejects missing credentials.
9. Delete the bootstrap token only after first Super Admin login is confirmed:

```bash
npx wrangler secret delete BOOTSTRAP_ADMIN_TOKEN --name hrm-system
```

Bootstrap works only once, the bootstrap token must not be shared, and the frontend must never store the bootstrap token in localStorage.

### Frontend Production Configuration

- `frontend/.env.example` leaves `VITE_API_BASE_URL` empty for same-origin `/api/v1` calls.
- If the frontend is hosted separately from the Worker, set `VITE_API_BASE_URL` to the Worker origin.
- If frontend and backend are served from the same origin, `VITE_API_BASE_URL` can be empty and the app will use same-origin `/api/v1`.
- Do not hardcode localhost, workers.dev previews, Pages previews, or old deployment URLs into production bundles.
- Do not put secrets in frontend env files.
- Build and preview:

```bash
cd frontend
npm install
npm run build
npm run preview
```

### Production Smoke Test Checklist

Backend smoke tests:

- `GET /api/v1/health` returns production status.
- `GET /api/v1/health/deep` returns binding diagnostics.
- Unknown `/api/*` endpoint returns JSON `API_ROUTE_NOT_FOUND`, not the React app shell.
- Login fails safely with wrong credentials.
- Protected endpoints reject missing credentials.
- `GET /api/v1/bootstrap/status` returns the expected setup state.
- `POST /api/v1/bootstrap/initialize` is blocked after setup is complete.
- `GET /api/v1/auth/me` works after login.
- Logout clears the session.

Deployment verification commands:

```bash
curl.exe -i https://YOUR_FRONTEND_DOMAIN/api/v1/health
curl.exe -i https://YOUR_FRONTEND_DOMAIN/api/v1/bootstrap/status
curl.exe -i https://YOUR_FRONTEND_DOMAIN/api/not-real
```

Expected:

- `/api/v1/health` returns JSON success.
- `/api/v1/bootstrap/status` returns JSON.
- `/api/not-real` returns structured JSON 404 with `API_ROUTE_NOT_FOUND`.
- None of these return `index.html`.
- None of these fail with CORS when called from the actual frontend origin.

If frontend and API are separate deployments, also verify:

```bash
curl.exe -i https://YOUR_API_DOMAIN/api/v1/health
```

In Chrome DevTools, confirm the bootstrap/status request URL is the intended API URL and does not point to localhost, a stale preview URL, or the wrong domain.

Frontend smoke tests:

- Frontend loads without console errors on initial load.
- `/setup` appears only when setup is required.
- Login works.
- Login-time 2FA works when enabled.
- Dashboard loads or shows permission-aware state.
- Sidebar collapse works and navigation respects permissions.
- No dark mode toggle exists.

Core module smoke tests:

- Employees, Settings, Attendance, Leave, Payroll, Documents, Approvals, Reports, Import/Export, and Backup/Recovery pages load for authorized users.
- Users without `payroll.view` cannot open payroll details.
- Users without `documents.view_sensitive` see masked sensitive document names.
- Users without approval permission cannot approve.
- Users without report module permission do not trigger protected report queries.
- Hidden tabs do not call unauthorized APIs.
- Browser-visible data never includes `file_key`, R2 object keys, device token hashes, API token hashes, password hashes, token/secret fields, or payslip file keys.

R2 and data movement smoke tests:

- Document upload/download works for authorized users.
- Export download works only when the file is ready.
- Backup create/download works for authorized users.
- Import upload validates MIME type and reason.
- Locked payroll blocks unsafe attendance, leave, advance, loan, and deduction changes with friendly locked-period messages.

### Backup, Restore, Import, And Export Runbook

- Backup jobs use `BACKUP_BUCKET`, exclude secrets/password hashes/token hashes/TOTP secrets/raw document files, and show “Backup completed successfully.” only when the response indicates completed or file-ready.
- “Backup job created successfully.” means queued, processing, or not ready.
- Restore requests are metadata/approval records only. Destructive production restore is not implemented in this UI and must use a separate controlled procedure if ever required.
- Import upload requires a reason, rejects dangerous MIME types, clears base64/file state after upload, and must be validated before apply.
- Import apply may remain a placeholder unless the backend returns `applied=true`; the UI must not claim data was imported when `applied=false`.
- Sensitive exports require a reason and permission. Export downloads are available only when file-ready.
- R2 keys are internal only: `DOCUMENTS_BUCKET` stores employee document files, while `BACKUP_BUCKET` stores exports/imports/backups.

### Known Future Work

- Real PDF rendering.
- Real XLSX/export formatting.
- External email/SMS provider integration.
- Separate controlled destructive restore procedure, if ever needed.
- Mobile app/kiosk standalone polish.
- Vendor biometric SDK-specific UI/bridge enhancements.

## Local health response

`GET /api/v1/health` returns:

```json
{
  "success": true,
  "status": "ok",
  "service": "hrm-api",
  "environment": "local",
  "timestamp": "2026-06-03T00:00:00.000Z",
  "version": "0.1.0",
  "requestId": "req_xxx",
  "request_id": "req_xxx"
}
```

## Notes for future implementation

- Add domain modules inside `src/modules/` as the product grows
- Add real D1 schema migrations when the data model is finalized
- Expand the Durable Object and realtime service when notification events are defined
- Add authentication and permission middleware only when the auth design is ready
