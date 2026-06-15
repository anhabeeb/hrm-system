import type { DocumentKycEmployeeRecord, DocumentKycFilters, DocumentKycRequestInput, DocumentKycRequestRecord, DocumentKycStagedUploadRecord } from "./document-kyc.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();
const nowIso = () => new Date().toISOString();

export const findEmployee = (env: Env, companyId: string, id: string) =>
  one<DocumentKycEmployeeRecord>(
    env,
    `SELECT id, company_id, employee_code, full_name, department_id, position_id, level,
            primary_outlet_id, employment_status, deleted_at, archived_at
       FROM employees
      WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, id],
  );

export const findEmployeeByUserId = (env: Env, companyId: string, userId: string) =>
  one<DocumentKycEmployeeRecord>(
    env,
    `SELECT e.id, e.company_id, e.employee_code, e.full_name, e.department_id, e.position_id, e.level,
            e.primary_outlet_id, e.employment_status, e.deleted_at, e.archived_at
       FROM users u
       JOIN employees e ON e.id = u.employee_id AND e.company_id = u.company_id
      WHERE u.company_id = ? AND u.id = ? LIMIT 1`,
    [companyId, userId],
  );

const requestSelect = `
  SELECT r.*, e.full_name AS employee_name, e.employee_code
    FROM employee_kyc_update_requests r
    JOIN employees e ON e.id = r.employee_id AND e.company_id = r.company_id
`;

export const findRequestById = (env: Env, companyId: string, id: string) =>
  one<DocumentKycRequestRecord>(env, `${requestSelect} WHERE r.company_id = ? AND r.id = ? LIMIT 1`, [companyId, id]);

export const findDuplicatePendingRequest = (env: Env, input: { companyId: string; employeeId: string; requestType: string; documentType?: string | null; requestedField?: string | null }) =>
  one<DocumentKycRequestRecord>(
    env,
    `${requestSelect}
      WHERE r.company_id = ? AND r.employee_id = ? AND r.request_type = ?
        AND COALESCE(r.document_type, '') = COALESCE(?, '')
        AND COALESCE(r.requested_field, '') = COALESCE(?, '')
        AND r.status IN ('DRAFT','PENDING','PENDING_OWNER_REVIEW','PENDING_FINAL_APPROVAL','PENDING_APPLICATION','PENDING_MANUAL_REVIEW','APPROVED')
      LIMIT 1`,
    [input.companyId, input.employeeId, input.requestType, input.documentType ?? null, input.requestedField ?? null],
  );

const where = (companyId: string, filters: DocumentKycFilters, extraSql?: string, extraValues: unknown[] = []) => {
  const clauses = ["r.company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.employee_id) { clauses.push("r.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.request_type) { clauses.push("r.request_type = ?"); values.push(filters.request_type); }
  if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
  if (filters.document_type) { clauses.push("r.document_type = ?"); values.push(filters.document_type); }
  if (extraSql) { clauses.push(extraSql); values.push(...extraValues); }
  return { sql: clauses.join(" AND "), values };
};

export const countRequests = async (env: Env, companyId: string, filters: DocumentKycFilters, extraSql?: string, extraValues: unknown[] = []) => {
  const built = where(companyId, filters, extraSql, extraValues);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM employee_kyc_update_requests r WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listRequests = (env: Env, companyId: string, filters: DocumentKycFilters, extraSql?: string, extraValues: unknown[] = []) => {
  const built = where(companyId, filters, extraSql, extraValues);
  return many<DocumentKycRequestRecord>(
    env,
    `${requestSelect}
      WHERE ${built.sql}
      ORDER BY r.updated_at DESC, r.created_at DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const createRequest = (env: Env, input: {
  id: string;
  companyId: string;
  actorUserId: string;
  payload: DocumentKycRequestInput & {
    employee_id: string;
    requester_employee_id?: string | null;
    requester_user_id?: string | null;
    department_id?: string | null;
    position_id?: string | null;
    level?: number | null;
    outlet_id?: string | null;
  };
}) => run(
  env,
  `INSERT INTO employee_kyc_update_requests (
    id, company_id, employee_id, requester_employee_id, requester_user_id,
    department_id, position_id, level, outlet_id, request_type, document_type,
    document_id, requested_field, current_value_json, requested_value_json,
    staged_file_key, staged_file_name, staged_mime_type, staged_file_size,
    document_number, issue_date, expiry_date, issuing_country,
    reason, employee_note, status, verification_status, created_at, updated_at,
    created_by, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'DRAFT', ?, ?, ?, ?)`,
  [
    input.id,
    input.companyId,
    input.payload.employee_id,
    input.payload.requester_employee_id ?? null,
    input.payload.requester_user_id ?? null,
    input.payload.department_id ?? null,
    input.payload.position_id ?? null,
    input.payload.level ?? null,
    input.payload.outlet_id ?? null,
    input.payload.request_type,
    input.payload.document_type ?? null,
    input.payload.document_id ?? null,
    input.payload.requested_field ?? null,
    input.payload.current_value_json ? JSON.stringify(input.payload.current_value_json) : null,
    input.payload.requested_value_json ? JSON.stringify(input.payload.requested_value_json) : null,
    input.payload.staged_file_key ?? null,
    input.payload.staged_file_name ?? null,
    input.payload.staged_mime_type ?? null,
    input.payload.staged_file_size ?? null,
    input.payload.document_number ?? null,
    input.payload.issue_date ?? null,
    input.payload.expiry_date ?? null,
    input.payload.issuing_country ?? null,
    input.payload.reason,
    input.payload.employee_note ?? null,
    nowIso(),
    nowIso(),
    input.actorUserId,
    input.actorUserId,
  ],
);

export const updateRequest = (env: Env, companyId: string, id: string, values: Record<string, unknown>) => {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      params.push(value);
    }
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_at = ?");
  params.push(nowIso(), companyId, id);
  return run(env, `UPDATE employee_kyc_update_requests SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, params);
};

export const findEmployeeDocumentById = (env: Env, companyId: string, employeeId: string, documentId: string) =>
  one<any>(
    env,
    `SELECT *
       FROM employee_documents
      WHERE company_id = ? AND employee_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [companyId, employeeId, documentId],
  );

export const findStagedUploadForCreate = (env: Env, input: { companyId: string; employeeId: string; fileKey: string }) =>
  one<DocumentKycStagedUploadRecord>(
    env,
    `SELECT *
       FROM document_upload_staging
      WHERE company_id = ? AND employee_id = ? AND file_key = ?
        AND status = 'STAGED'
        AND request_id IS NULL
        AND purpose = 'DOCUMENT_KYC_UPDATE'
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1`,
    [input.companyId, input.employeeId, input.fileKey, nowIso()],
  );

export const findStagedUploadForApply = (env: Env, input: { companyId: string; employeeId: string; fileKey: string; requestId: string }) =>
  one<DocumentKycStagedUploadRecord>(
    env,
    `SELECT *
       FROM document_upload_staging
      WHERE company_id = ? AND employee_id = ? AND file_key = ?
        AND request_id = ?
        AND status = 'ATTACHED_TO_REQUEST'
        AND purpose = 'DOCUMENT_KYC_UPDATE'
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1`,
    [input.companyId, input.employeeId, input.fileKey, input.requestId, nowIso()],
  );

export const attachStagedUploadToRequest = (env: Env, input: { companyId: string; id: string; requestId: string; actorUserId: string }) =>
  run(
    env,
    `UPDATE document_upload_staging
        SET status = 'ATTACHED_TO_REQUEST', request_id = ?, updated_at = ?
      WHERE company_id = ? AND id = ? AND status = 'STAGED'`,
    [input.requestId, nowIso(), input.companyId, input.id],
  );

export const employeePatchColumns = new Set([
  "phone",
  "email",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  "nationality",
  "id_card_number",
  "passport_number",
  "bank_name",
  "bank_account_masked",
  "bank_account_holder",
  "notes",
]);

export const applyEmployeeProfilePatch = (env: Env, companyId: string, employeeId: string, actorUserId: string, patch: Record<string, unknown>) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (employeePatchColumns.has(key)) {
      sets.push(`${key} = ?`);
      values.push(value ?? null);
    }
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_by = ?", "updated_at = ?");
  values.push(actorUserId, nowIso(), companyId, employeeId);
  return run(env, `UPDATE employees SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

const buildEmployeeProfilePatchStatement = (env: Env, companyId: string, employeeId: string, actorUserId: string, patch: Record<string, unknown>) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  const changedFields: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (employeePatchColumns.has(key)) {
      sets.push(`${key} = ?`);
      values.push(value ?? null);
      changedFields.push(key);
    }
  }
  if (sets.length === 0) return { statement: null, changedFields };
  sets.push("updated_by = ?", "updated_at = ?");
  values.push(actorUserId, nowIso(), companyId, employeeId);
  return {
    statement: bind(env.DB.prepare(`UPDATE employees SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`), values),
    changedFields,
  };
};

const documentTypeForEmployeeDocument = (type?: string | null) => {
  if (!type) return "other";
  const normalized = type.toLowerCase();
  if (normalized === "national_id") return "national_id";
  if (normalized === "work_permit") return "work_permit";
  if (normalized === "visa") return "work_visa";
  if (normalized === "medical_certificate") return "medical_certificate";
  if (normalized === "passport") return "passport";
  return normalized;
};

export const applyApprovedDocumentKycBundle = async (env: Env, input: {
  companyId: string;
  request: DocumentKycRequestRecord;
  actorUserId: string;
  profilePatch: Record<string, unknown>;
  createDocument: boolean;
  sourceDocument?: any | null;
  stagedUpload?: DocumentKycStagedUploadRecord | null;
  applyNote?: string | null;
}) => {
  const statements: D1PreparedStatement[] = [];
  const profile = buildEmployeeProfilePatchStatement(env, input.companyId, input.request.employee_id, input.actorUserId, input.profilePatch);
  if (profile.statement) statements.push(profile.statement);
  let createdDocumentId: string | null = null;
  if (input.createDocument) {
    createdDocumentId = `doc_${crypto.randomUUID().replace(/-/g, "")}`;
    if (input.request.document_id) {
      statements.push(bind(env.DB.prepare(
        `UPDATE employee_documents
            SET status = 'replaced', replaced_by_document_id = ?, verification_status = 'SUPERSEDED', updated_by = ?, updated_at = ?
          WHERE company_id = ? AND id = ?`,
      ), [createdDocumentId, input.actorUserId, nowIso(), input.companyId, input.request.document_id]));
    }
    statements.push(bind(env.DB.prepare(
      `INSERT INTO employee_documents (
        id, company_id, employee_id, document_type, file_key, file_name, mime_type,
        expiry_date, status, is_sensitive, uploaded_by, created_by, updated_by,
        created_at, updated_at, document_number, issue_date, start_date,
        document_category, notes, version_number, previous_document_id,
        verification_status, source_kyc_request_id, verified_at, verified_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?, 'VERIFIED', ?, ?, ?)`,
    ), [
      createdDocumentId,
      input.companyId,
      input.request.employee_id,
      documentTypeForEmployeeDocument(input.request.document_type),
      input.stagedUpload?.file_key ?? input.sourceDocument?.file_key,
      input.stagedUpload?.file_name ?? input.sourceDocument?.file_name ?? "approved-document",
      input.stagedUpload?.mime_type ?? input.sourceDocument?.mime_type ?? "application/octet-stream",
      input.request.expiry_date ?? null,
      input.actorUserId,
      input.actorUserId,
      input.actorUserId,
      nowIso(),
      nowIso(),
      input.request.document_number ?? null,
      input.request.issue_date ?? null,
      input.request.document_type ?? "OTHER",
      input.request.reason,
      input.request.document_id ?? null,
      input.request.id,
      nowIso(),
      input.actorUserId,
    ]));
    if (input.stagedUpload) {
      statements.push(bind(env.DB.prepare(
        `UPDATE document_upload_staging
            SET status = 'CONSUMED', updated_at = ?
          WHERE company_id = ? AND id = ? AND request_id = ? AND status = 'ATTACHED_TO_REQUEST'`,
      ), [nowIso(), input.companyId, input.stagedUpload.id, input.request.id]));
    }
  }
  statements.push(bind(env.DB.prepare(
    `UPDATE employee_kyc_update_requests
        SET status = 'APPLIED', verification_status = 'VERIFIED', applied_at = ?, applied_by = ?,
            apply_note = ?, updated_by = ?, updated_at = ?
      WHERE company_id = ? AND id = ?`,
  ), [nowIso(), input.actorUserId, input.applyNote ?? null, input.actorUserId, nowIso(), input.companyId, input.request.id]));
  await env.DB.batch(statements);
  return { changedFields: profile.changedFields, createdDocumentId };
};

export const listApprovalTimelineRows = (env: Env, companyId: string, approvalRequestId: string) =>
  many<any>(
    env,
    `SELECT id, action, actor_user_id, from_status, to_status, reason, comment, created_at
       FROM approval_actions
      WHERE company_id = ? AND approval_request_id = ?
      ORDER BY created_at ASC`,
    [companyId, approvalRequestId],
  );
