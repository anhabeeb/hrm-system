# API Smoke Test Checklist

Run this checklist against staging first. Production mutating checks must use approved disposable records only.

## Auth

- Login with username.
- Login with email.
- Login with remember me enabled.
- Logout and verify session revocation.
- Confirm disabled users are blocked.

## Employee

- List employees with a scoped HR/Admin user.
- Open employee detail.
- Assign an employee login.
- Confirm normal employee users land on `/self/dashboard`.

## Structure

- List departments and positions.
- View level role templates.
- Create a staging employee structure change request.
- Approve/apply only in staging.

## Approvals

- List pending approvals.
- Open approval detail.
- Open approval timeline.
- Confirm generic approval routes reject module-bound mutation where module-safe routes are required.

## Modules

- Leave: submit, approve, reject through leave-safe routes in staging.
- Attendance correction: submit, approve, reject through attendance-safe routes in staging.
- Roster change: submit, approve, reject through roster-safe routes in staging.
- Payroll adjustment: submit, approve, reject, apply through payroll-safe routes in staging.
- Advance salary: submit, approve, execute payment, inspect deductions in staging.
- Document/KYC: submit, approve, apply with a valid staged/existing document source in staging.
- Employee transfer/structure change: submit, approve, apply in staging.
- Resignation/offboarding: submit, approve, inspect task ownership, complete task in staging.
- Disciplinary action: submit, approve, apply, acknowledge, close in staging.

## Settings And Ownership

- Open permission audit.
- Open Operation Ownership setup warnings.
- Confirm no sensitive operation is missing owner/final approval/execution responsibility.

## Safety Checks

- Normal employee cannot view coworker sensitive records.
- Department manager sees only eligible department/lower-level records.
- Self-approval remains blocked unless a workflow step explicitly allows it.
- Browser `alert()` and `confirm()` are not used.
