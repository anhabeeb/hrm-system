-- Employee login assignment: add username login support and enforce one user per employee.
ALTER TABLE users ADD COLUMN username TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_company_employee_id ON users(company_id, employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_employee_unique
ON users(company_id, employee_id)
WHERE employee_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_username_unique
ON users(company_id, username COLLATE NOCASE)
WHERE username IS NOT NULL AND deleted_at IS NULL;
