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
