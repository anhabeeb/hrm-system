# HRM System

Cloudflare Workers + D1 HRM system for employee management, attendance, payroll preview, approvals, biometric integration, password hashing, sessions, and Google Authenticator 2FA.

## Stack

- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1
- **Frontend:** Static assets served by the same Worker
- **Auth:** Cookie sessions, PBKDF2 password hashing with Web Crypto, optional TOTP/Google Authenticator
- **Deployment:** Wrangler or Cloudflare Workers Git integration

## Project structure

```text
src/index.js              Worker API and static asset fallback
public/                   Frontend static app
migrations/               D1 schema migrations
wrangler.jsonc            Worker + D1 configuration
```

## D1 binding

This project is configured for your D1 database:

```jsonc
{
  "binding": "DB",
  "database_name": "hrm-system",
  "database_id": "59ded11f-6298-4b0b-9970-6000fbd0dca1"
}
```

## First-time setup

Install dependencies:

```bash
npm install
```

Apply migrations locally:

```bash
npm run db:migrate:local
```

Run locally:

```bash
npm run dev
```

Open the local Worker URL and complete the setup screen. The first user becomes `SUPERADMIN`.

## Deploy

Apply D1 migrations to the remote database:

```bash
npm run db:migrate:remote
```

Deploy the Worker:

```bash
npm run deploy
```

## Optional biometric push token

For biometric device push integration, set a Worker secret:

```bash
wrangler secret put BIOMETRIC_PUSH_TOKEN
```

Devices/local bridge can then POST to:

```text
POST /api/biometric/push
Header: x-biometric-token: <your secret>
```

Example body:

```json
{
  "employeeCode": "EMP-0002",
  "eventTime": "2026-05-22T09:00:00+05:00",
  "eventType": "IN",
  "deviceSerial": "DEVICE-001"
}
```

## Implemented in this first build

- Setup wizard with no default credentials
- Secure password hashing using Web Crypto PBKDF2
- HttpOnly secure session cookies
- Role foundations: Superadmin, Admin, HR, Manager, Accountant, Employee
- Superadmin/Admin settings page
- Approval request global toggle and effective approval logic
- Employee profiles with salary, department, store, overtime and benefit switches
- Department and store/location tables
- Manual attendance records
- Monthly payroll preview with absent deductions, overtime, benefits, and advances
- Google Authenticator compatible TOTP setup/enable flow
- Biometric device table and push-event endpoint
- Audit log table and core audit events

## Next build modules

Recommended next implementation order:

1. Employee edit/details screens
2. Full leave request workflow and long-leave deduction rules
3. User account management and role assignment UI
4. Approval workflow execution screens
5. Payroll period generation/approval/payment records
6. Biometric event processing into attendance records
7. Reports and export filters
8. R2 employee document uploads
