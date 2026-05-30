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
wrangler secret put SESSION_SECRET
wrangler secret put JWT_SECRET
wrangler secret put PASSWORD_PEPPER
wrangler secret put DEVICE_TOKEN_SECRET
wrangler secret put TOTP_ENCRYPTION_KEY
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

D1 migrations are ordered SQL files that create and update the database schema over time. They should be reviewed before being applied, especially when they touch production data.

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

Before deploying, make sure you have replaced placeholder resource IDs and bucket names in `wrangler.jsonc`, and added all required secrets in Cloudflare.

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
- Future payroll UI should use professional tables, filters, status badges, compact summaries, row action icons, and payroll flow steps rather than bubble-heavy screens.

## Approval Workflow Engine

The Approval Workflow Engine is available under `/api/v1/approvals`.

- Approval requests are user-authenticated and feature-gated; device-authenticated kiosk, sync, and biometric callers cannot access approval routes.
- Approval modes support `disabled`, `manual`, `auto_admin_superadmin`, and `full_workflow`; if approval settings are missing, the safe seeded default is Admin/Super Admin direct approval.
- Approval lists, details, pending counts, and histories are paginated or table-friendly and apply outlet access protection.
- Static approval routes such as settings, workflows, and thresholds are registered before approval request `/:id` routes.
- Requesters cannot approve, reject, or return their own approval requests.
- Terminal approval requests cannot be acted on again.
- Workflow steps enforce required role and permission keys; users receive a friendly message when a request is waiting for a different approval step.
- Super Admin override is supported for approve/reject decisions, requires a reason, writes a high-severity audit log, and does not bypass hard business locks owned by target modules.
- Workflow configuration supports create, update, enable, disable, and step CRUD with audit logs.
- Threshold configuration supports create, update, enable, disable, and history rows for policy review.
- Target-module integration is intentionally conservative: approvals record the decision and return a clear note when the target module must safely apply the approved change itself.
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

## Local health response

`GET /api/v1/health` returns:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "hrm-api",
    "environment": "local"
  },
  "message": "HRM API is running"
}
```

## Notes for future implementation

- Add domain modules inside `src/modules/` as the product grows
- Add real D1 schema migrations when the data model is finalized
- Expand the Durable Object and realtime service when notification events are defined
- Add authentication and permission middleware only when the auth design is ready
