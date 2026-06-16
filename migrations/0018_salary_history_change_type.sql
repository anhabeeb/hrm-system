ALTER TABLE employee_salary_history
  ADD COLUMN change_type TEXT NOT NULL DEFAULT 'starting_salary';

ALTER TABLE employee_salary_history
  ADD COLUMN updated_at TEXT;
