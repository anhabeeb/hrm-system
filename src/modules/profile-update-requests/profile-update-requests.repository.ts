import type {
  ProfileUpdateRequestFilters,
  ProfileUpdateRequestRecord,
  ReviewInput,
} from "./profile-update-requests.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

const where = (companyId: string, filters: ProfileUpdateRequestFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  const pairs: Array<[keyof ProfileUpdateRequestFilters, string]> = [
    ["status", "status = ?"],
    ["request_type", "request_type = ?"],
    ["user_id", "user_id = ?"],
    ["employee_id", "employee_id = ?"],
  ];
  for (const [key, clause] of pairs) {
    const value = filters[key];
    if (value) {
      clauses.push(clause);
      values.push(value);
    }
  }
  if (filters.date_from) {
    clauses.push("created_at >= ?");
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    clauses.push("created_at <= ?");
    values.push(filters.date_to);
  }
  return { sql: clauses.join(" AND "), values };
};

export const countRequests = async (env: Env, companyId: string, filters: ProfileUpdateRequestFilters) => {
  const built = where(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM user_profile_update_requests WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};
export const listRequests = (env: Env, companyId: string, filters: ProfileUpdateRequestFilters) => {
  const built = where(companyId, filters);
  return many<ProfileUpdateRequestRecord>(
    env,
    `SELECT * FROM user_profile_update_requests WHERE ${built.sql}
     ORDER BY ${filters.sort_by} ${filters.sort_direction.toUpperCase()} LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};
export const findRequestById = (env: Env, companyId: string, id: string) =>
  one<ProfileUpdateRequestRecord>(env, "SELECT * FROM user_profile_update_requests WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);
export const updateReviewStatus = (env: Env, companyId: string, id: string, status: string, actorUserId: string, input: ReviewInput, oldValueJson?: string | null) =>
  run(
    env,
    `UPDATE user_profile_update_requests SET status = ?, old_value_json = COALESCE(?, old_value_json),
      reviewed_by = ?, reviewed_at = ?, review_notes = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      status,
      oldValueJson ?? null,
      actorUserId,
      new Date().toISOString(),
      input.review_notes,
      new Date().toISOString(),
      companyId,
      id,
    ],
  );
export const findUser = (env: Env, companyId: string, userId: string) =>
  one<{ id: string; full_name: string; email: string | null; phone: string | null; employee_id: string | null }>(
    env,
    "SELECT id, full_name, email, phone, employee_id FROM users WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, userId],
  );

export const findUserByEmail = (env: Env, companyId: string, email: string) =>
  one<{ id: string; email: string | null }>(
    env,
    "SELECT id, email FROM users WHERE company_id = ? AND lower(email) = lower(?) AND deleted_at IS NULL LIMIT 1",
    [companyId, email],
  );
export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<Record<string, unknown>>(
    env,
    "SELECT * FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
  );
export const updateUserFields = (env: Env, companyId: string, userId: string, values: { full_name?: string; email?: string; phone?: string }) =>
  run(
    env,
    `UPDATE users SET
      full_name = COALESCE(?, full_name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [values.full_name ?? null, values.email ?? null, values.phone ?? null, new Date().toISOString(), companyId, userId],
  );

export const revokeUserSessions = (env: Env, companyId: string, userId: string) =>
  run(
    env,
    "UPDATE sessions SET revoked_at = ? WHERE company_id = ? AND user_id = ? AND revoked_at IS NULL",
    [new Date().toISOString(), companyId, userId],
  );
export const updateEmployeeFields = (env: Env, companyId: string, employeeId: string, values: Record<string, unknown>) =>
  run(
    env,
    `UPDATE employees SET
      full_name = COALESCE(?, full_name),
      phone = COALESCE(?, phone),
      emergency_contact_name = COALESCE(?, emergency_contact_name),
      emergency_contact_phone = COALESCE(?, emergency_contact_phone),
      id_card_number = COALESCE(?, id_card_number),
      passport_number = COALESCE(?, passport_number),
      bank_name = COALESCE(?, bank_name),
      bank_account_masked = COALESCE(?, bank_account_masked),
      updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      values.full_name ?? null,
      values.phone ?? null,
      values.emergency_contact_name ?? null,
      values.emergency_contact_phone ?? null,
      values.id_card_number ?? null,
      values.passport_number ?? null,
      values.bank_name ?? null,
      values.bank_account_masked ?? null,
      new Date().toISOString(),
      companyId,
      employeeId,
    ],
  );
export const createEmployeeDocumentMetadata = (env: Env, input: {
  id: string;
  companyId: string;
  employeeId: string;
  documentType: string;
  fileKey: string;
  fileName?: string | null;
  mimeType?: string | null;
  uploadedBy: string;
}) =>
  run(
    env,
    `INSERT INTO employee_documents (
      id, company_id, employee_id, document_type, file_key, file_name,
      mime_type, status, is_sensitive, uploaded_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'valid', 1, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.documentType,
      input.fileKey,
      input.fileName ?? null,
      input.mimeType ?? null,
      input.uploadedBy,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
