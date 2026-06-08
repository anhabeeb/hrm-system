# HRM Deployment Checklist

Git is the production source of truth for the HRM app. Cloudflare production must deploy only from the configured Git production branch, not from stale ZIP folders, old local directories, manual uploads, or accidental rollbacks.

## Permanent Source-Of-Truth Rule

- Git is the production source of truth.
- Cloudflare production deploys only from the configured Git branch.
- Do not deploy from stale ZIP folders or copied local project directories.
- Do not manually upload a folder unless it was generated from latest Git.
- Do not use Cloudflare rollback to a deployment older than the Users & Access route fix unless intentionally restoring that old version.
- Always pull latest before making changes.
- Always commit and push before Cloudflare deployment.
- Always run predeploy checks before deployment.
- Always run postdeploy smoke tests after deployment.

## Recommended Workflow

```bash
git status
git pull
npm install
npm --prefix frontend install
npm run build
npm run typecheck
npm test
git add .
git commit -m "Describe change"
git push
npm run smoke:production
```

## Cloudflare Settings To Verify

- Production branch must be `main` or the intended production branch.
- Build command should be `npm run build`.
- Deploy command should be `npx wrangler deploy` or `npm run deploy`, depending on Cloudflare setup.
- If using separate Cloudflare build and deploy commands:
  - Build command: `npm run build`
  - Deploy command: `npx wrangler deploy`
- If using `npm run deploy`, the build command can be empty/simple, but avoid double-building if Cloudflare already runs `npm run build`.
- Wrangler Static Assets must keep `assets.directory = ./frontend/dist`.
- Wrangler Static Assets must keep `assets.not_found_handling = single-page-application`.
- Wrangler Static Assets must keep `assets.binding = ASSETS`.
- Wrangler Static Assets must keep `assets.run_worker_first` including `/api/*`.

## Critical Route Guardrails

The build runs `npm run verify:critical-routes`. This fails if any of these disappear from source:

- `src/routes/users.routes.ts`
- `src/routes/roles.routes.ts`
- `src/routes/permissions.routes.ts`
- `apiV1.route("/users", usersRoutes)`
- `apiV1.route("/roles", rolesRoutes)`
- `apiV1.route("/permissions", permissionsRoutes)`
- Worker `/api/*` routing to the API app
- Worker non-API routing to `env.ASSETS.fetch(request)`

Correct unauthenticated production behavior:

- `/api/v1/users` returns `401` JSON
- `/api/v1/roles` returns `401` JSON
- `/api/v1/permissions` returns `401` JSON

If those routes return `404 API_ROUTE_NOT_FOUND`, production is not running the latest source-of-truth Worker script.

## Document Compliance Migration Guardrails

Phase 3 foreign employee document tracking extends `employee_documents` through `migrations/0017_foreign_employee_document_history.sql`.

- Apply migration `0017_foreign_employee_document_history.sql` once before using document compliance fields.
- The migration is forward-only and must not wipe, recreate, or backfill-destructively modify `employee_documents`.
- SQLite/D1 `ALTER TABLE ... ADD COLUMN` is not reliably idempotent across all contexts, so do not re-run this migration blindly after a partial failure.
- If a partial migration failure occurs, inspect the existing table first:

```bash
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(employee_documents);"
```

- Confirm these columns exist before retrying or manually applying missing columns: `document_number`, `issue_date`, `start_date`, `document_category`, `driving_license_category`, `driving_license_category_other`, `version_number`, `replaced_by_document_id`, `previous_document_id`, `notes`, `created_by`, `updated_by`, and `updated_at`.
- Run `npm run verify:document-schema` locally before deployment to confirm source migration/checklist coverage for the required document history columns.
- Do not drop existing employee document records. Replacements must preserve old rows and link versions through `previous_document_id` and `replaced_by_document_id`.
- Document API list/detail responses must never expose `file_key`, R2 object keys, storage paths, tokens, or raw secrets.

## Salary History Migration Guardrails

Phase 5A Salary & Compensation extends `employee_salary_history` through `migrations/0018_salary_history_change_type.sql`.

- Apply migration `0018_salary_history_change_type.sql` once before using salary change/increment workflow.
- The migration is forward-only and must not wipe, recreate, or overwrite `employee_salary_history`.
- SQLite/D1 `ALTER TABLE ... ADD COLUMN` is not reliably idempotent across all partial-apply scenarios, so do not blindly rerun this migration after a failure.
- If migration `0018` partially applied, inspect the existing table first:

```bash
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(employee_salary_history);"
```

- Confirm change_type and updated_at exist after migration.
- Confirm these salary history columns exist before retrying or manually applying missing columns: `employee_id`, `monthly_salary_amount`, `currency`, `effective_from`, `effective_to`, `reason`, `approval_request_id`, `created_by`, `created_at`, `change_type`, and `updated_at`.
- Run `npm run verify:salary-schema` locally before deployment to confirm source migration/checklist coverage for the required salary history columns.
- Do not drop existing salary records. Salary changes must preserve old rows, close the previous row with `effective_to`, and insert a new active row.
- Payroll must continue using `employee_salary_history` as the salary source of truth and must not silently fall back to position default salary.

## Compensation Components Migration Guardrails

Phase 5D Salary & Compensation adds recurring allowances, benefits, and recurring deductions through `migrations/0024_employee_compensation_components.sql`, hardens concurrency/idempotency through `migrations/0025_compensation_concurrency_hardening.sql`, and records immutable compensation approval applications through `migrations/0026_compensation_approval_applications.sql`.

- Apply migration `0024_employee_compensation_components.sql` once before using recurring compensation components.
- Apply migration `0025_compensation_concurrency_hardening.sql` once before enabling concurrent compensation edits or compensation approval application.
- Apply migration `0026_compensation_approval_applications.sql` once before relying on compensation approval retry/recovery for create, change, or end actions.
- The migration is forward-only and must not wipe, recreate, or overwrite salary history, payroll items, advances, or salary loans.
- Do not drop existing salary history or payroll history while adding compensation components.
- If migration `0024` or `0025` partially applied, inspect the existing tables first:

```bash
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(employee_compensation_components);"
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(compensation_component_definitions);"
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(compensation_approval_applications);"
npx wrangler d1 execute hrm-system --remote --command "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='employee_compensation_components' ORDER BY name;"
npx wrangler d1 execute hrm-system --remote --command "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='compensation_approval_applications' ORDER BY name;"
```

- Before applying the unique approval-request index in production, check for duplicate applied approval targets:

```bash
npx wrangler d1 execute hrm-system --remote --command "SELECT company_id, approval_request_id, COUNT(*) AS duplicates FROM employee_compensation_components WHERE approval_request_id IS NOT NULL GROUP BY company_id, approval_request_id HAVING COUNT(*) > 1;"
npx wrangler d1 execute hrm-system --remote --command "SELECT company_id, approval_request_id, COUNT(*) AS count FROM compensation_approval_applications GROUP BY company_id, approval_request_id HAVING COUNT(*) > 1;"
```

- If duplicate `approval_request_id` rows exist, do not delete them silently. Review the affected approval history and compensation rows, choose the correct applied target, and archive/correct duplicates through a supervised data repair before applying the unique index.
- If duplicate immutable approval application mappings exist, do not overwrite them silently. Stop deployment and review the affected approval request before continuing.
- Confirm these compensation columns exist before retrying or manually applying missing columns: `component_type`, `component_code`, `component_name`, `amount`, `currency`, `calculation_type`, `affects_gross_pay`, `affects_net_pay`, `effective_from`, `effective_to`, `status`, `revision`, `reason`, `approval_request_id`, `created_by`, `updated_by`, and `updated_at`.
- Confirm `idx_employee_comp_components_approval_request_unique` exists after migration `0025`.
- Confirm `idx_compensation_approval_applications_request_unique`, `idx_compensation_approval_applications_component`, and `idx_compensation_approval_applications_employee` exist after migration `0026`.
- Run `npm run verify:compensation-schema` locally before deployment to confirm source migration/checklist coverage.
- Compensation changes must preserve history by ending the previous component row and inserting a new effective-dated row.
- Compensation replacement must be atomic: a failed replacement insert must not leave the previous component closed.
- Concurrent creates must rely on repository/database guards, not only application-level overlap checks.
- Approved compensation create, change, and end actions must each create an immutable `compensation_approval_applications` mapping.
- Compensation approval retry/recovery must check `compensation_approval_applications` before the mutable component `approval_request_id` compatibility field.
- End approvals must not overwrite the component row's earlier approval reference; the End approval belongs in the immutable application mapping.
- Non-cash benefits must remain identifiable and must not increase estimated payable cash compensation.
- Cash allowance/benefit/deduction summary buckets include only components that affect gross or net pay; `recurring_gross_*` and `recurring_net_*` are the authoritative gross/net effects.
- Advances and salary loans remain separate modules and must not be duplicated as recurring deductions.

## Payroll Calculation Hardening Migration Guardrails

Phase 6A Payroll Calculation Hardening extends payroll run/item traceability through `migrations/0027_payroll_calculation_hardening.sql`.

- Apply migration `0027_payroll_calculation_hardening.sql` once before using hardened payroll calculation.
- The migration is forward-only and must not wipe, recreate, or overwrite payroll, salary history, compensation history, advances, salary loans, attendance, leave, or payslip metadata.
- Do not drop existing payroll records while adding calculation metadata.
- If migration `0027` partially applied, inspect the existing payroll tables first:

```bash
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(payroll_runs);"
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(payroll_items);"
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(payroll_earnings);"
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(payroll_deductions);"
npx wrangler d1 execute hrm-system --remote --command "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='payroll_runs' ORDER BY name;"
npx wrangler d1 execute hrm-system --remote --command "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='payroll_items' ORDER BY name;"
```

- Confirm payroll run columns exist before retrying or manually applying missing columns: `payroll_year`, `payroll_month_number`, `period_start`, `period_end`, `currency`, `calculation_status`, `calculation_version`, `calculation_started_at`, `calculated_at`, and `calculation_settings_json`.
- Confirm generated item traceability columns exist before retrying or manually applying missing columns: `source_type`, `source_id`, `source_reference`, `calculation_code`, `calculation_description`, `calculation_metadata_json`, `generated_by_calculation`, and `calculation_version`.
- Confirm `idx_payroll_runs_company_year_month` and `idx_payroll_items_run_generated` exist after migration `0027`.
- Run `npm run verify:payroll-schema` locally before deployment to confirm source migration/checklist coverage.
- Payroll must use `employee_salary_history` as the source of truth for basic salary and must not silently fall back to position default salary.
- Recurring payroll allowances, benefits, and deductions must come from effective-dated `employee_compensation_components`.
- Explicit `absent` attendance summaries, approved leave, and approved attendance corrections must classify days deterministically before payroll deductions are applied.
- Missing expected workdays must block calculation when completion is required, and may count as absence only when the payroll setting explicitly enables that policy.
- Non-cash benefits must remain traceable but must not increase payable cash salary.
- Compensation `affects_gross_pay` and `affects_net_pay` flags are independent; net-disabled allowances/benefits must never become deductions.
- Payroll preview must remain read-only and must not create/update payroll runs, payroll items, advances, or loan repayment state.
- Recalculation must clear only generated payroll rows and preserve approved manual payroll adjustments unless a future explicit admin confirmation flow says otherwise.
- Generated payroll rows should be calculated in memory first and published together so failed calculations do not expose a partial current result set.
- Draft recalculation may rebuild generated payroll rows, but finalized or locked payroll must never be recalculated.
- Salary advances and salary loan installments are deducted during calculation preview/draft calculation only; they are not marked repaid until a later finalization workflow.
- Apply migration `0028_payroll_finalization_repayments.sql` before enabling payroll finalization in production.
- Payroll finalization uses the immutable `payroll_repayment_applications` ledger with unique `(company_id, payroll_run_id, source_type, source_id)` rows so retrying finalization does not double-apply salary advances or salary loan installments.
- Finalized payroll is immutable: calculation, attendance edits, leave edits, long-leave salary impacts, salary/compensation changes, asset deductions, advances, and salary-loan schedule changes must treat `finalizing` and `finalized` like locked payroll.
- The old lock endpoint must not be used to bypass finalization; locking is handled by payroll finalization only.
- Finalized payroll cannot be reopened until the safe reversal workflow is implemented.
- Verify finalization columns and repayment tables before deployment:

```bash
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(payroll_runs);"
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(payroll_repayment_applications);"
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(payslips);"
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(advance_payments);"
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(salary_loan_installments);"
npx wrangler d1 execute hrm-system --remote --command "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='payroll_repayment_applications' ORDER BY name;"
npx wrangler d1 execute hrm-system --remote --command "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='payslips' ORDER BY name;"
```

- Confirm payroll finalization columns exist before enabling the endpoint: `approval_request_id`, `submitted_for_approval_by`, `submitted_for_approval_at`, `finalization_started_at`, `finalization_failed_reason`, `finalized_by`, and `finalized_at`.
- Confirm finalized payslip snapshots columns exist: `snapshot_json`, `employee_snapshot_json`, `company_snapshot_json`, `period_snapshot_json`, `earnings_json`, `deductions_json`, `non_cash_benefits_json`, `totals_json`, `calculation_version`, `finalized_at`, `download_count`, `last_downloaded_at`, `printed_count`, and `last_printed_at`.
- Confirm payslip uniqueness indexes exist, especially `idx_payslips_company_item_unique` and `idx_payslips_company_run_employee_unique`.
- Payslips are generated only after payroll finalization. Do not generate payslips for approved-but-not-finalized payroll.
- Finalization creates immutable payslip snapshots from finalized payroll item data; manual batch generation may only repair/create missing finalized snapshots.
- Use the payslip print/save as PDF view until real PDF generation is implemented.
- Do not expose payslip file_key values through API responses, UI payloads, print views, downloads, export previews, realtime events, or audit payloads.
- Run `npm run verify:payslip-schema` locally before deployment.
- Apply migration `0030_employee_lifecycle_history.sql` before enabling employee lifecycle status changes in production.
- Employee lifecycle status changes are effective-dated and must not mutate a finalized payroll period.
- Future-dated employee status changes must return `EMPLOYEE_STATUS_SCHEDULING_NOT_SUPPORTED` until scheduled activation is implemented.
- High-risk lifecycle approval settings are reserved and default off until approval-backed status application is wired; current status changes remain permission-gated, reason-required, immediate, and audited.
- New employee onboarding must create the initial `employee_status_history` row with `effective_from`, `created_by`, and `updated_at`.
- Verify employee lifecycle history columns before deployment:

```bash
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(employee_status_history);"
npx wrangler d1 execute hrm-system --remote --command "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='employee_status_history' ORDER BY name;"
```

- Confirm lifecycle columns exist: `effective_from`, `effective_to`, `notes`, `approval_request_id`, `approved_by`, `created_by`, and `updated_at`.
- Confirm lifecycle indexes exist: `idx_employee_status_history_employee_effective`, `idx_employee_status_history_employee_status`, and `idx_employee_status_history_company_effective`.
- Run `npm run verify:employee-lifecycle-schema` locally before deployment.
- Apply migration `0031_employee_offboarding.sql` before enabling employee offboarding in production.
- Confirm offboarding tables exist: `employee_offboarding_cases`, `employee_offboarding_tasks`, and `employee_final_settlement_drafts`.
- Confirm offboarding indexes exist: `idx_offboarding_cases_company_employee_status`, `idx_offboarding_cases_company_status_exit`, `idx_offboarding_tasks_case_status`, and `idx_final_settlement_drafts_case`.
- Offboarding final settlement drafts are preparation only and must not mark salary advances, salary loans, payroll runs, or payslips as finalized/paid.
- Run `npm run verify:offboarding-schema` locally before deployment.
- Confirm repayment tracking columns exist: `advance_payments.repaid_amount`, `advance_payments.repaid_at`, `salary_loan_installments.paid_amount`, and `salary_loan_installments.paid_at`.
- Apply migration `0032_employee_contracts.sql` before enabling employee contract management in production.
- Confirm the `employee_contracts` table exists with contract dates, renewal linkage, document linkage, versioning, salary snapshot, department/position/outlet snapshot, archive fields, and company-scoped contract number uniqueness.
- Confirm contract indexes exist: `idx_employee_contracts_company_employee_start`, `idx_employee_contracts_company_employee_end`, `idx_employee_contracts_company_status`, `idx_employee_contracts_company_end`, and `idx_employee_contracts_company_document`.
- Confirm `documents.contract_rules` settings and employment contract document categories are seeded before enabling contract UI flows.
- Contract renewal must create a new linked contract record and preserve the old contract history. Contract expiry must not automatically terminate an employee.
- Run `npm run verify:contract-schema` locally before deployment.
- Apply migration `0033_roster_scheduling_hardening.sql` before enabling duty roster scheduling in production.
- Confirm roster schema support exists for `shift_templates`, `roster_shifts`, and `roster_conflicts`, including shift template code/scope, roster date, break minutes, publish/cancel fields, conflict detection timestamps, and roster indexes.
- Confirm `attendance.roster_rules` settings are allowed and seeded before exposing roster settings.
- Roster edits must remain blocked for finalized, locked, paid, or finalizing payroll months. Do not use roster tools to reopen or mutate finalized attendance/payroll.
- Run `npm run verify:roster-schema` locally before deployment.

## Phase 8B Attendance Rule Hardening

- Apply migration `0034_attendance_rule_hardening.sql` before relying on hardened attendance classification metadata.
- Confirm `attendance_daily_summary` includes expected shift, classification, absence minutes, leave/holiday/rest/incomplete flags, warnings/source metadata, calculated timestamp, and correction reference columns.
- Confirm attendance rule settings expose grace period, missed punch policy, default shift fallback, roster requirement, overtime rules, complete-attendance-before-payroll, and missing-attendance-as-absence controls.
- Payroll must continue reading `attendance_daily_summary` and must not double-deduct unpaid leave as absence.
- Run `npm run verify:attendance-schema` locally before deployment.

## Phase 9A Leave Balance / Accrual Hardening

- Apply migration `0037_leave_balance_accrual_hardening.sql` before enabling hardened leave balances, accrual, carry-forward, expiry, opening balances, or manual adjustments.
- Confirm `leave_balances` includes pending, adjusted, carried-forward, expired, available, entitlement, accrual-period, and accrual-date fields.
- Confirm `leave_balance_transactions` exists and includes idempotency keys, source metadata, balance-before/after values, and leave request linkage.
- Leave balance changes must be written through the transaction ledger. Do not directly edit ledger rows in production.
- Accrual-enabled leave types start with entitlement as metadata only; accrual transactions credit earned leave. Carry-forward must come from carry-forward transactions, not from default policy prefill.
- If historical migration `0019_job_history_old_new_columns.sql` was partially applied in production, inspect `employee_job_history` before retrying because SQLite/D1 additive column migrations can fail on duplicate columns:

```bash
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(employee_job_history);"
```

- Run `npm run verify:leave-balance-schema` locally before deployment.

## Approval Finalization Migration Guardrails

Phase 5C Salary & Promotion Approval hardening extends `approval_requests` and protects final apply actions through `migrations/0022_approval_finalization_hardening.sql` and `migrations/0023_approval_applying_recovery.sql`.

- Apply migration `0022_approval_finalization_hardening.sql` once before using salary approval retry/finalization recovery.
- Apply migration `0023_approval_applying_recovery.sql` once before using stale applying retry recovery.
- The migration is forward-only and must not wipe, recreate, or overwrite approval history.
- SQLite/D1 `ALTER TABLE ... ADD COLUMN` is not reliably idempotent across partial-apply scenarios, so do not blindly rerun this migration after a failure.
- If migration `0022` partially applied, inspect the existing table first:

```bash
npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(approval_requests);"
```

- Confirm these approval request columns exist before retrying or manually applying missing columns: `applied_at`, `failure_code`, `failure_message`, `retry_count`, `last_retry_at`, and `applying_started_at`.
- Confirm the unique final apply index exists before retrying finalization-sensitive workflows:

```bash
npx wrangler d1 execute hrm-system --remote --command "PRAGMA index_list(approval_actions);"
```

- The index `idx_approval_actions_unique_final_apply` prevents duplicate `applied` action rows for the same approval request.
- Run `npm run verify:approval-schema` locally before deployment to confirm source migration/checklist coverage for approval finalization hardening.
- Approval retry should recover already-applied targets idempotently and must not create duplicate salary history or job history rows.
- Recently applying approval requests must not be retried until the configured `approval_applying_recovery_minutes` window has elapsed. Stale applying requests may be recovered using `applying_started_at`; do not manually mark them failed unless the recovery window has passed.

## Postdeploy Smoke Test

Run:

```bash
npm run smoke:production
```

Or test another environment:

```bash
SMOKE_BASE_URL=https://preview.example.com npm run smoke:production
```

Expected production result:

- `/api/v1/health` returns `200` JSON
- `/api/v1/version` returns `200` JSON
- `/api/v1/users` returns `401` JSON unauthenticated
- `/api/v1/roles` returns `401` JSON unauthenticated
- `/api/v1/permissions` returns `401` JSON unauthenticated
- `/api/not-real` returns `404 API_ROUTE_NOT_FOUND` JSON
- `/` returns `200` HTML
- `/dashboard` returns `200` HTML

## Production Acceptance

Before go-live, run the local verification chain from a clean checkout:

```bash
npm ci
npm audit --audit-level=critical
npm run build
npm run typecheck
npm test
npm run verify:production-readiness
npm run verify:production-acceptance
```

After deployment, run the read-only production smoke test:

```bash
SMOKE_BASE_URL=https://hrm.cafeasiana.com.mv npm run smoke:production
```

If frontend and API use separate domains, run:

```bash
SMOKE_BASE_URL=https://hrm.cafeasiana.com.mv SMOKE_API_BASE_URL=https://api.hrm.cafeasiana.com.mv SMOKE_ALLOWED_ORIGIN=https://hrm.cafeasiana.com.mv npm run smoke:production
```

Staging-only authenticated acceptance can be run with test credentials:

```bash
ACCEPTANCE_BASE_URL=https://staging-hrm.example.com ACCEPTANCE_USERNAME=staging-admin ACCEPTANCE_PASSWORD=*** npm run acceptance:staging
```

Do not run staging mutation tests in production. Imports, restores, archives, payroll finalization, destructive settings changes, and data repair scripts require an explicit staging-only or approved production change window.

## Production Migration Safety

- Take a backup before applying D1 migrations.
- Verify the backup is stable, retrievable, and checksummed.
- Apply D1 migrations once and in order with `wrangler d1 migrations apply DB --remote`.
- Run schema verifiers after migration through `npm run build`.
- Verify bootstrap/setup state after migration.
- Do not run destructive restore/archive/import tests in production.
- If a migration fails, stop, inspect the affected table with `PRAGMA table_info(...)`, and create a forward repair migration where practical.
- D1 migrations may not be reversible; do not assume rollback can undo schema changes.

## Route And Domain Guardrails

- Make sure `/api/*` routes go to Worker API through `assets.run_worker_first`.
- Make sure SPA routes return frontend HTML, not API JSON.
- Make sure API routes return structured JSON, not frontend HTML.
- Keep `hrm.cafeasiana.com.mv` routed to the current Worker deployment.
- Use `api.hrm.cafeasiana.com.mv` only if CORS, cookies, and routing are intentionally configured for a separate API domain.
- Do not deploy from stale ZIP folders. Git is source of truth.
- Do not use old Cloudflare rollback before route fixes unless intentionally returning to a known-good deployment with the same critical route coverage.

## Rollback Guidance

- Identify the previous known-good deployment before deploying.
- Keep the pre-migration backup available until acceptance is complete.
- Worker rollback can restore code/assets but cannot automatically reverse D1 schema migrations.
- Prefer forward-fix migrations for D1 after schema changes.
- If deployment smoke fails because API routes return HTML, check Worker `run_worker_first` and domain routing before rolling back.
- If smoke fails because protected routes return 404, production likely deployed stale source or an old route table.
- If smoke fails because frontend routes return API JSON, check SPA asset fallback and route configuration.

## Warnings

- Do not click Cloudflare Rollback to a deployment older than the route fix unless intentionally restoring an old version.
- Do not deploy from old ZIPs.
- Do not let a module-specific update deploy from a local folder that is missing previous fixes.
- Future Codex changes must be committed and pushed to the production branch before Cloudflare deploys.
