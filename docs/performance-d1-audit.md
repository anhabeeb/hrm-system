# Phase 13D Performance / D1 Audit

## High-Traffic Endpoints Reviewed

- Dashboard summary and quick actions: uses summary/count queries rather than report row endpoints, with outlet/company scope retained.
- Employee 360 profile: default profile request passes a bounded history limit and avoids document binary/file fetches.
- Attendance reports: date-bounded validators require daily/monthly/detail/exception/device-punch ranges and cap page size.
- HR reports and payroll reports: catalog endpoints stay metadata-only; report rows are paginated and scoped by company/outlet filters.
- Expiry alerts, notifications, email notifications: list/dropdown flows are capped and backed by status/recipient/date indexes.
- Imports, exports, backup/restore, and data retention/archive: job and row lists are paginated; export/import/archive previews enforce row limits from previous phases.
- Attendance, biometric, leave, long leave, payroll-impacting imports, and roster flows: existing business locks and idempotency checks remain intact while indexes improve lookup paths.

## Current Query Risks And Fixes

- HR report `sort_by` previously accepted arbitrary trimmed values. It now uses an allowlist matching known safe sort fields.
- Heavy route modules were imported eagerly by the frontend router. They are now route-level lazy imports behind `Suspense`.
- Roster, attendance-date, biometric device-health, leave status/date, and long-leave status/date query paths had lighter index coverage than newer report/import/export/archive paths. A focused additive index migration was added.
- Existing Phase 11D/12A/12B/12C limits remain in place for export rows, import rows, backup snapshots, restore previews, and archive previews.

## Indexes Added

Migration `0054_performance_d1_indexes.sql` adds:

- `idx_perf_attendance_summary_company_date` on `attendance_daily_summary(company_id, attendance_date)`
- `idx_perf_roster_shifts_company_employee_date` on `roster_shifts(company_id, employee_id, shift_date)`
- `idx_perf_roster_shifts_company_outlet_date` on `roster_shifts(company_id, outlet_id, shift_date)`
- `idx_perf_roster_conflicts_company_status_created` on `roster_conflicts(company_id, status, created_at)`
- `idx_perf_biometric_devices_company_status_seen` on `biometric_devices(company_id, status, last_seen_at)`
- `idx_perf_leave_requests_company_status_dates` on `leave_requests(company_id, status, start_date, end_date)`
- `idx_perf_long_leave_records_company_status_dates` on `long_leave_records(company_id, status, start_date, expected_return_date)`

These are additive, non-destructive, and match real list/report/review query patterns. The verifier parses migrations to confirm referenced tables and columns exist.

## Frontend Lazy Loading

The router now lazy-loads heavy pages:

- Employee 360
- Attendance Reports
- Notifications and Expiry Alerts
- HR Reports and Payroll Reports
- Export History and Print views
- Import Center
- Backup & Recovery
- Data Retention

Core login/setup/dashboard/app shell remains eager so the first operational path stays responsive.

## Request And Caching Notes

- The existing React Query usage already scopes cache keys by feature/filter in high-traffic pages.
- No new server-side shared cache was added, avoiding cross-company or cross-user leakage risk.
- Lookup and report catalogs remain good candidates for future short-lived frontend cache tuning, but only with company/scope-aware keys.
- Notification and dashboard polling were not made more aggressive; no new realtime or Durable Object dependency was introduced.

## Cloudflare D1 / Workers Considerations

- All changes remain compatible with Cloudflare Workers and D1.
- No Node-only runtime dependency was added.
- Indexes are additive and use `CREATE INDEX IF NOT EXISTS`.
- Bounded pagination and row limits protect Worker CPU time and D1 result sizes.
- Existing R2/export/backup behavior remains unchanged.

## Performance Verifier

`npm run verify:performance-d1` checks:

- Performance audit documentation exists.
- Heavy frontend routes are lazy-loaded.
- Page-size caps and date bounds exist on high-risk validators.
- HR/payroll report sort fields are allowlisted.
- High-risk repositories retain company scope and bounded query markers.
- Phase 13D index migration references real table columns and avoids duplicate definitions.
- Unsupported Vitest 3 pool-options guidance is not present.

## Known Future Optimizations

- Visual bundle analysis with a dedicated analyzer can further split shared chart/table dependencies if needed.
- Employee 360 can become per-tab backend loading if profile payloads grow beyond current bounded summaries.
- Dashboard widget refresh intervals can be tuned after production traffic measurements.
- Server-side cache for static catalogs can be considered later, but only with company and permission/scope-aware cache keys.
- D1 query plan inspection against production-like data should happen during Phase 13E or a later operational review, not in this implementation phase.
