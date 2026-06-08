# Acceptance Test Matrix

Use this matrix for staging acceptance first, then production smoke/read-only checks. Production tests must not mutate business data unless a separate approved production change window says otherwise.

| Test Case | Role/User | Precondition | Steps | Expected Result | Pass/Fail |
|---|---|---|---|---|---|
| First-time setup | Super Admin bootstrap actor | Fresh environment or documented setup state | Open `/setup`, verify bootstrap status, initialize only if setup is incomplete | Setup is blocked after initialization and does not expose secrets |  |
| Login/logout | Admin/HR test user | User is active | Log in, open `/auth/me`, log out | Session cookie is set then invalidated; `/auth/me` no longer returns user after logout |  |
| Password change | Active user | Current password known | Change password with current password | Password changes, existing sessions are revoked where supported |  |
| 2FA if enabled | 2FA-enabled user | TOTP configured | Log in and complete TOTP | Login succeeds only with valid TOTP |  |
| User/role/permission management | Super Admin/Admin | Seeded roles exist | Open Users & Access, view users/roles/permissions | Data is scoped and dangerous actions are guarded |  |
| Employee create/edit/view | HR/Admin | Required lookups exist | Create/edit a staging employee, then view details | Validation, company scope, and outlet/department scope hold |  |
| Employee 360 | HR/Admin | `ACCEPTANCE_EMPLOYEE_ID` available | Open employee profile tabs | Overview, attendance, leave, documents, payroll-sensitive tabs respect permissions |  |
| Document upload/view/expiry | HR/Admin | Test employee exists | Upload/view document in staging; inspect expiry metadata | File keys are not exposed and expiry status is correct |  |
| Attendance import/biometric/manual correction | HR/Admin | Staging data only | Preview import, inspect biometric punches, submit correction | Preview is read-only; corrections respect locks and permissions |  |
| Roster publish/conflicts | Scheduler/Admin | Staging roster data | Create draft, publish, inspect conflicts | Published roster affects attendance; conflicts are visible and scoped |  |
| Attendance reports | HR/Admin/Manager | Attendance data exists | Run daily/date-bounded report | Rows and totals are company/outlet scoped and paginated |  |
| Leave balance/accrual | HR/Admin | Leave types exist | View balances and accrual ledger | Balances match transactions; no direct ledger mutation |  |
| Leave request approval | Employee/Approver | Approver configured | Submit request in staging, approve/reject | Multi-step workflow and reservation lifecycle behave correctly |  |
| Long leave payroll preview | HR/Payroll | Foreign employee test data | Preview long leave payroll impact | Preview is read-only and deduction method is correct |  |
| Holiday calendar | HR/Admin | Calendar enabled | Create/view recurring/local/foreign/outlet holiday in staging | Applicability and affects flags persist |  |
| In-app notifications | User/Admin | Notifications exist | View unread count and list | User sees own notifications; admin views only with permission |  |
| Email notifications dry-run/configured | Admin | Email settings configured | Run staging dry-run/process check | Provider secrets are not logged; dry-run does not send real mail |  |
| Expiry alerts scan | HR/Admin | Expiring documents exist | Run staging scan or view summary | Scan is idempotent and scoped |  |
| Dashboard | Admin/HR/Manager | Dashboard permissions seeded | Open dashboard | Counts are bounded, scoped, and do not leak restricted data |  |
| HR reports | HR/Admin | Report data exists | Open catalog and run bounded report | Catalog is light; data is paginated and scoped |  |
| Payroll reports | Payroll/Admin | Payroll data exists | Open catalog and bounded report | Sensitive amounts require permission |  |
| Export/print | Admin/HR | Report permission exists | Generate staging export and print view | CSV formula protection and permission re-checks hold |  |
| Import preview/apply in staging | Admin/HR | Staging CSV fixture | Preview, validate, then apply only in staging | Preview is read-only; apply is idempotent and audited |  |
| Backup create/download | Super Admin/Admin | R2 backup bucket configured | Create backup and download | Backup is stable, checksummed, and permission controlled |  |
| Restore preview in staging | Super Admin/Admin | Valid staging backup exists | Validate and preview restore | Preview is read-only and unsupported tables are skipped/blocked |  |
| Data retention preview in staging | Admin | Policy configured | Run archive preview | Preview is read-only, bounded, and shows blocked reasons |  |
| Permission denied behavior | Normal employee | Employee linked to user | Attempt HR/payroll/admin pages | Friendly 403/denied state; no sensitive data returned |  |
| Outlet-scoped manager behavior | Outlet manager | Multiple outlet data exists | View employees/attendance/reports | Only allowed outlet data and totals are visible |  |
| Employee self-service behavior | Normal employee | Linked employee exists | View own profile/leave/notifications | Own-record access works; other employee data is denied |  |
| Security headers/CORS | Anonymous | Production URL deployed | Run `npm run smoke:production` | Headers exist; CORS preflight is strict |  |
| Performance sanity | Admin/HR | Production-like data volume | Open dashboard/reports/employees | Main bundle is split; large lists are paginated and responsive |  |
