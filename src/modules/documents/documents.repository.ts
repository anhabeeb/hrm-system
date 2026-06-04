import type { DocumentCategoryFilters, DocumentCategoryInput, DocumentFilters, DocumentOutletScope, DocumentUpdateInput } from "./documents.types";
import { DOCUMENT_EXPIRING_SOON_DAYS } from "./documents.constants";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

const applyScope = (clauses: string[], values: unknown[], filters: { outlet_id?: string }, scope: DocumentOutletScope) => {
  if (scope.isSuperAdmin) return;
  if (scope.outletIds.length === 0) {
    clauses.push("1 = 0");
    return;
  }
  if (filters.outlet_id && !scope.outletIds.includes(filters.outlet_id)) {
    clauses.push("1 = 0");
    return;
  }
  clauses.push(`e.primary_outlet_id IN (${scope.outletIds.map(() => "?").join(", ")})`);
  values.push(...scope.outletIds);
};

const documentWhere = (companyId: string, filters: DocumentFilters, scope: DocumentOutletScope) => {
  const clauses = ["d.company_id = ?", "d.deleted_at IS NULL"];
  const values: unknown[] = [companyId];
  applyScope(clauses, values, filters, scope);
  if (filters.employee_id) { clauses.push("d.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.employee_type) { clauses.push("e.employee_type = ?"); values.push(filters.employee_type); }
  if (filters.document_type) { clauses.push("d.document_type = ?"); values.push(filters.document_type); }
  if (filters.status) {
    if (filters.status === "expiring_soon") {
      clauses.push("d.expiry_date IS NOT NULL AND d.expiry_date >= date('now') AND d.expiry_date <= date('now', '+' || ? || ' day') AND d.status NOT IN ('archived', 'replaced', 'deleted', 'rejected')");
      values.push(DOCUMENT_EXPIRING_SOON_DAYS);
    } else if (filters.status === "expired") {
      clauses.push("d.expiry_date IS NOT NULL AND d.expiry_date < date('now') AND d.status NOT IN ('archived', 'replaced', 'deleted')");
    } else if (filters.status === "no_expiry") {
      clauses.push("d.expiry_date IS NULL AND d.status NOT IN ('archived', 'replaced', 'deleted', 'rejected')");
    } else if (filters.status === "active") {
      clauses.push("(d.status IN ('active', 'valid') AND (d.expiry_date IS NULL OR d.expiry_date > date('now', '+' || ? || ' day')))");
      values.push(DOCUMENT_EXPIRING_SOON_DAYS);
    } else {
      clauses.push("d.status = ?");
      values.push(filters.status);
    }
  }
  if (filters.is_sensitive !== undefined) { clauses.push("d.is_sensitive = ?"); values.push(filters.is_sensitive ? 1 : 0); }
  if (filters.expiry_from) { clauses.push("d.expiry_date IS NOT NULL AND d.expiry_date >= ?"); values.push(filters.expiry_from); }
  if (filters.expiry_to) { clauses.push("d.expiry_date IS NOT NULL AND d.expiry_date <= ?"); values.push(filters.expiry_to); }
  if (filters.expiring_within_days !== undefined) { clauses.push("d.expiry_date IS NOT NULL AND d.expiry_date <= date('now', '+' || ? || ' day')"); values.push(filters.expiring_within_days); }
  if (filters.expiring_before) { clauses.push("d.expiry_date IS NOT NULL AND d.expiry_date <= ?"); values.push(filters.expiring_before); }
  return { sql: clauses.join(" AND "), values };
};

export const countDocuments = async (env: Env, companyId: string, filters: DocumentFilters, scope: DocumentOutletScope) => {
  const built = documentWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM employee_documents d JOIN employees e ON e.id = d.employee_id WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listDocuments = (env: Env, companyId: string, filters: DocumentFilters, scope: DocumentOutletScope, includeSensitive: boolean) => {
  const built = documentWhere(companyId, filters, scope);
  const sensitivityClause = includeSensitive ? "" : " AND d.is_sensitive = 0";
  return many<any>(
    env,
    `SELECT d.id, d.company_id, d.employee_id, e.employee_code, e.full_name AS employee_name,
      e.primary_outlet_id AS outlet_id, o.name AS outlet_name, e.employee_type,
      d.document_type, d.document_number, d.issue_date, d.start_date,
      d.file_name, d.mime_type, d.expiry_date, d.status, d.is_sensitive,
      d.driving_license_category, d.driving_license_category_other,
      d.version_number, d.previous_document_id, d.replaced_by_document_id,
      d.notes, d.uploaded_by, d.created_by, d.updated_by, d.created_at, d.updated_at
     FROM employee_documents d
     JOIN employees e ON e.id = d.employee_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     WHERE ${built.sql}${sensitivityClause}
     ORDER BY d.expiry_date ASC, d.created_at DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findDocumentById = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    `SELECT d.*, e.employee_code, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id, o.name AS outlet_name
     FROM employee_documents d
     JOIN employees e ON e.id = d.employee_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     WHERE d.company_id = ? AND d.id = ? AND d.deleted_at IS NULL LIMIT 1`,
    [companyId, id],
  );

export const findEmployee = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    "SELECT id, employee_code, full_name, employee_type, primary_outlet_id, employment_status, deleted_at FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const createDocument = (env: Env, input: {
  id: string;
  companyId: string;
  employeeId: string;
  documentType: string;
  documentNumber?: string | null;
  issueDate?: string | null;
  startDate?: string | null;
  fileKey: string;
  fileName: string;
  mimeType: string;
  expiryDate?: string | null;
  drivingLicenseCategory?: string | null;
  drivingLicenseCategoryOther?: string | null;
  notes?: string | null;
  isSensitive: boolean;
  uploadedBy: string;
  versionNumber?: number;
  previousDocumentId?: string | null;
}) =>
  run(
    env,
    `INSERT INTO employee_documents (
      id, company_id, employee_id, document_type, file_key, file_name,
      mime_type, expiry_date, status, is_sensitive, uploaded_by, created_by,
      updated_by, created_at, updated_at, document_number, issue_date,
      start_date, document_category, driving_license_category,
      driving_license_category_other, version_number, previous_document_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.documentType,
      input.fileKey,
      input.fileName,
      input.mimeType,
      input.expiryDate ?? null,
      input.isSensitive ? 1 : 0,
      input.uploadedBy,
      input.uploadedBy,
      input.uploadedBy,
      new Date().toISOString(),
      new Date().toISOString(),
      input.documentNumber ?? null,
      input.issueDate ?? null,
      input.startDate ?? null,
      input.documentType,
      input.drivingLicenseCategory ?? null,
      input.drivingLicenseCategoryOther ?? null,
      input.versionNumber ?? 1,
      input.previousDocumentId ?? null,
      input.notes ?? null,
    ],
  );

export const updateDocument = (env: Env, companyId: string, id: string, input: DocumentUpdateInput, updatedBy?: string) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["document_type", "document_number", "issue_date", "start_date", "file_name", "mime_type", "expiry_date", "status", "driving_license_category", "driving_license_category_other", "notes", "is_sensitive"] as const) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(key === "is_sensitive" ? (input[key] ? 1 : 0) : input[key]);
    }
  }
  if (sets.length === 0) return Promise.resolve();
  if (updatedBy) {
    sets.push("updated_by = ?");
    values.push(updatedBy);
  }
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE employee_documents SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const updateDocumentStatus = (env: Env, companyId: string, id: string, input: { status: string; replacedByDocumentId?: string | null; updatedBy: string }) =>
  run(
    env,
    `UPDATE employee_documents
     SET status = ?, replaced_by_document_id = COALESCE(?, replaced_by_document_id), updated_by = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [input.status, input.replacedByDocumentId ?? null, input.updatedBy, new Date().toISOString(), companyId, id],
  );

export const listDocumentHistory = (env: Env, companyId: string, employeeId: string, documentType: string, includeSensitive: boolean) =>
  many<any>(
    env,
    `SELECT d.id, d.company_id, d.employee_id, d.document_type, d.document_number,
      d.issue_date, d.start_date,
      CASE WHEN d.is_sensitive = 1 AND ? = 0 THEN 'Sensitive document' ELSE d.file_name END AS file_name,
      d.mime_type, d.expiry_date, d.status, d.is_sensitive,
      d.driving_license_category, d.driving_license_category_other,
      d.version_number, d.previous_document_id, d.replaced_by_document_id,
      d.notes, d.uploaded_by, d.created_by, d.updated_by, d.created_at, d.updated_at
     FROM employee_documents d
     WHERE d.company_id = ? AND d.employee_id = ? AND d.document_type = ? AND d.deleted_at IS NULL
     ORDER BY d.version_number DESC, d.created_at DESC`,
    [includeSensitive ? 1 : 0, companyId, employeeId, documentType],
  );

export const listLatestEmployeeDocuments = (env: Env, companyId: string, employeeId: string, includeSensitive: boolean) =>
  many<any>(
    env,
    `SELECT d.id, d.company_id, d.employee_id, d.document_type, d.document_number,
      d.issue_date, d.start_date,
      CASE WHEN d.is_sensitive = 1 AND ? = 0 THEN 'Sensitive document' ELSE d.file_name END AS file_name,
      d.mime_type, d.expiry_date, d.status, d.is_sensitive,
      d.driving_license_category, d.driving_license_category_other,
      d.version_number, d.previous_document_id, d.replaced_by_document_id,
      d.notes, d.uploaded_by, d.created_by, d.updated_by, d.created_at, d.updated_at
     FROM employee_documents d
     WHERE d.company_id = ? AND d.employee_id = ? AND d.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM employee_documents newer
         WHERE newer.company_id = d.company_id
           AND newer.employee_id = d.employee_id
           AND newer.document_type = d.document_type
           AND newer.deleted_at IS NULL
           AND COALESCE(newer.version_number, 1) > COALESCE(d.version_number, 1)
       )
     ORDER BY d.document_type ASC, d.created_at DESC`,
    [includeSensitive ? 1 : 0, companyId, employeeId],
  );

export const softDeleteDocument = (env: Env, companyId: string, id: string) =>
  run(
    env,
    "UPDATE employee_documents SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [new Date().toISOString(), new Date().toISOString(), companyId, id],
  );

export const createAccessLog = (env: Env, input: { id: string; companyId: string; employeeId?: string | null; documentId?: string | null; userId: string; action: string; ipAddress?: string | null; userAgent?: string | null }) =>
  run(
    env,
    `INSERT INTO document_access_logs (
      id, company_id, employee_id, document_id, user_id, action, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.id, input.companyId, input.employeeId ?? null, input.documentId ?? null, input.userId, input.action, input.ipAddress ?? null, input.userAgent ?? null, new Date().toISOString()],
  );

const categoryWhere = (companyId: string, filters: DocumentCategoryFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.is_sensitive !== undefined) { clauses.push("is_sensitive = ?"); values.push(filters.is_sensitive ? 1 : 0); }
  if (filters.applies_to_foreign_employee !== undefined) { clauses.push("applies_to_foreign_employee = ?"); values.push(filters.applies_to_foreign_employee ? 1 : 0); }
  if (filters.applies_to_local_employee !== undefined) { clauses.push("applies_to_local_employee = ?"); values.push(filters.applies_to_local_employee ? 1 : 0); }
  return { sql: clauses.join(" AND "), values };
};

export const listCategories = (env: Env, companyId: string, filters: DocumentCategoryFilters) => {
  const built = categoryWhere(companyId, filters);
  return many<any>(
    env,
    `SELECT * FROM document_categories WHERE ${built.sql}
     ORDER BY category_name ASC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};
export const countCategories = async (env: Env, companyId: string, filters: DocumentCategoryFilters) => {
  const built = categoryWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM document_categories WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};
export const findCategoryByKey = (env: Env, companyId: string, key: string) =>
  one<{ id: string }>(env, "SELECT id FROM document_categories WHERE company_id = ? AND category_key = ? LIMIT 1", [companyId, key]);
export const findCategoryById = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM document_categories WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);
export const createCategory = (env: Env, id: string, companyId: string, input: DocumentCategoryInput) =>
  run(
    env,
    `INSERT INTO document_categories (
      id, company_id, category_key, category_name, is_sensitive,
      requires_expiry_date, applies_to_foreign_employee, applies_to_local_employee,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, companyId, input.category_key, input.category_name, input.is_sensitive === false ? 0 : 1, input.requires_expiry_date ? 1 : 0, input.applies_to_foreign_employee ? 1 : 0, input.applies_to_local_employee ? 1 : 0, input.status ?? "active", new Date().toISOString(), new Date().toISOString()],
  );
export const updateCategory = (env: Env, companyId: string, id: string, input: Partial<DocumentCategoryInput>) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["category_key", "category_name", "is_sensitive", "requires_expiry_date", "applies_to_foreign_employee", "applies_to_local_employee", "status"] as const) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(typeof input[key] === "boolean" ? (input[key] ? 1 : 0) : input[key]);
    }
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE document_categories SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const listEmployeesForMissing = (env: Env, companyId: string, outletIds: string[], isSuperAdmin: boolean, outletId?: string) => {
  const clauses = ["company_id = ?", "deleted_at IS NULL", "employment_status NOT IN ('archived', 'resigned', 'terminated')"];
  const values: unknown[] = [companyId];
  if (!isSuperAdmin) {
    if (outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push(`primary_outlet_id IN (${outletIds.map(() => "?").join(", ")})`);
      values.push(...outletIds);
    }
  }
  if (outletId) { clauses.push("primary_outlet_id = ?"); values.push(outletId); }
  return many<any>(env, `SELECT id, employee_code, full_name, employee_type, primary_outlet_id FROM employees WHERE ${clauses.join(" AND ")} ORDER BY employee_code ASC LIMIT 500`, values);
};
export const listActiveRequiredCategories = (env: Env, companyId: string) =>
  many<any>(env, "SELECT * FROM document_categories WHERE company_id = ? AND status = 'active'", [companyId]);
export const listEmployeeDocumentTypes = (env: Env, companyId: string) =>
  many<{ employee_id: string; document_type: string }>(
    env,
    "SELECT employee_id, document_type FROM employee_documents WHERE company_id = ? AND deleted_at IS NULL AND status NOT IN ('deleted', 'archived', 'replaced')",
    [companyId],
  );
