-- Phase 9A note:
-- This historical migration is intentionally additive and non-destructive.
-- If a deployed D1 database was manually patched and one of these columns
-- already exists, verify with PRAGMA table_info(employee_job_history) before
-- applying and skip the already-present ALTER statement in that environment.
ALTER TABLE employee_job_history
ADD COLUMN old_outlet_id TEXT;

ALTER TABLE employee_job_history
ADD COLUMN new_outlet_id TEXT;

ALTER TABLE employee_job_history
ADD COLUMN old_department_id TEXT;

ALTER TABLE employee_job_history
ADD COLUMN new_department_id TEXT;

ALTER TABLE employee_job_history
ADD COLUMN old_position_id TEXT;

ALTER TABLE employee_job_history
ADD COLUMN new_position_id TEXT;
