# Phase 13C Test Coverage Audit

## Summary

- Before: 565 Vitest placeholder declarations were present across backend and frontend test files.
- After: 0 `it.todo`, `test.todo`, `describe.todo`, `it.skip`, `test.skip`, or `describe.skip` declarations remain in `tests/` or `frontend/src/tests/`.
- Remaining intentionally skipped tests: none.
- Vitest 4 targeted test syntax is now the supported command style. Do not use the removed Vitest 3 pool-options CLI form.
- Confirmation: no completed critical phase behavior remains hidden by placeholder tests.

## Actions Taken

Critical completed-phase placeholder blocks were retired after confirming behavior coverage exists in dedicated suites:

- Auth, sessions, permission, and security behavior are covered by `tests/auth.test.ts`, `tests/security-hardening.test.ts`, `tests/security-permissions.test.ts`, and `tests/permissions.test.ts`.
- Employee, document, lifecycle, and Employee 360 behavior are covered by `tests/employees.test.ts`, `tests/documents.test.ts`, `tests/employee-lifecycle.test.ts`, and report/profile suites.
- Attendance, roster, biometric, and attendance report behavior are covered by `tests/attendance-rules.test.ts`, `tests/attendance.test.ts`, `tests/attendance-reports.test.ts`, `tests/biometric.test.ts`, `tests/rosters.test.ts`, and related schema verifiers.
- Leave, approval, long-leave, and holiday behavior are covered by `tests/leave-balances.test.ts`, `tests/leave-approvals.test.ts`, `tests/long-leave.test.ts`, `tests/holidays.test.ts`, and supporting module tests.
- Notification, email, and expiry behavior are covered by `tests/notifications.test.ts`, `tests/email-notifications.test.ts`, and `tests/expiry-alerts.test.ts`.
- Dashboard, HR report, payroll report, export/print, import, backup/restore, and data-retention behavior are covered by their module suites and verifiers.
- Pure frontend TODO-only files were removed because completed-phase static route, guard, and UI expectations are now enforced by feature-specific frontend/static tests and schema verifiers rather than placeholder suites.
- `tests/outlet-access-hardening.test.ts` was restored as a real behavior suite covering outlet-scoped employees, employee-linked documents, payroll item totals, approval visibility, report/export totals, pagination counts, company-level approval eligibility, and payroll-lock blocking for attendance, leave, long leave, advances, loans, asset deductions, and payroll-impacting imports.
- `tests/frontend-ui-hardening.test.ts` replaces the frontend TODO-only coverage with real static tests for error diagnostics, permission-aware lookup selectors, leave/payroll/document/approval/report/import/export/backup route and navigation guards, hidden-tab API query gating, sensitive metadata display protection, and the no-dark-mode/no-theme-switcher rule.

## Replaced Frontend Placeholder Files

These frontend placeholder files were removed rather than allowlisted because they did not contain runnable behavior assertions and the completed-phase expectations are now covered by feature-specific tests and verifiers:

- `frontend/src/tests/attendance-sync-biometric.todo.ts`
- `frontend/src/tests/error-diagnostics.todo.test.ts`
- `frontend/src/tests/frontend-foundation.todo.ts`
- `frontend/src/tests/hr-admin-modules.todo.ts`
- `frontend/src/tests/phase1-selectors.todo.test.ts`
- `frontend/src/tests/prompt21-leave-payroll-ui.todo.test.ts`
- `frontend/src/tests/prompt22-assets-documents-approvals-ui.todo.test.ts`
- `frontend/src/tests/remaining-ui-completion.todo.test.ts`

No `.todo.test.ts` files are allowlisted.
The implemented UI behaviors from these files were replaced by `tests/frontend-ui-hardening.test.ts`. Deeper browser visual checks remain future integration work only when a stable visual/e2e harness exists. No completed security, permission, payroll, import/export, backup, document, employee-scope, or access-control behavior is deferred.

## Deferred Integration Needs

No Vitest skip or TODO declarations are allowlisted. Future non-blocking integration coverage can be added when stable infrastructure exists for real Cloudflare R2 binary object tests, queue/cron execution, and browser print visual rendering. These are not tracked as skipped tests in the suite.

## How To Run

Use Vitest 4-compatible targeted commands:

```bash
npx vitest run tests/security-hardening.test.ts tests/permissions.test.ts tests/security-permissions.test.ts tests/auth.test.ts tests/employees.test.ts tests/attendance-rules.test.ts tests/biometric.test.ts tests/leave-balances.test.ts tests/leave-approvals.test.ts tests/long-leave.test.ts tests/holidays.test.ts tests/notifications.test.ts tests/email-notifications.test.ts tests/expiry-alerts.test.ts tests/dashboard.test.ts tests/hr-reports.test.ts tests/payroll-reports.test.ts tests/export-print.test.ts tests/imports.test.ts tests/backup-recovery.test.ts tests/data-retention.test.ts
```

Run the placeholder guard with:

```bash
npm run verify:no-todo-tests
```
