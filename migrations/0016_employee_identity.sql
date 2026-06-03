ALTER TABLE employees ADD COLUMN passport_expiry_date TEXT;
ALTER TABLE employees ADD COLUMN work_permit_number TEXT;
ALTER TABLE employees ADD COLUMN work_permit_expiry_date TEXT;

CREATE TABLE IF NOT EXISTS employee_code_sequences (
  company_id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT 'EMP',
  next_number INTEGER NOT NULL DEFAULT 1,
  padding INTEGER NOT NULL DEFAULT 6,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO employee_code_sequences (
  company_id,
  prefix,
  next_number,
  padding,
  created_at,
  updated_at
)
SELECT
  company_id,
  'EMP',
  COALESCE(MAX(CASE
    WHEN employee_code GLOB 'EMP-[0-9]*' THEN CAST(substr(employee_code, 5) AS INTEGER)
    ELSE 0
  END), 0) + 1,
  6,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM employees
GROUP BY company_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_id_card_number_unique
ON employees(company_id, id_card_number)
WHERE id_card_number IS NOT NULL AND id_card_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_passport_number_unique
ON employees(company_id, passport_number)
WHERE passport_number IS NOT NULL AND passport_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_work_permit_number_unique
ON employees(company_id, work_permit_number)
WHERE work_permit_number IS NOT NULL AND work_permit_number <> '';
