import { describe, expect, it } from "vitest";

import app from "../src/app";
import {
  archiveDocument,
  buildEmployeeDocumentComplianceSummary,
  calculateDocumentValidityStatus,
  downloadDocument,
  getDocument,
  getDocumentHistory,
  listDocuments,
  listEmployeeDocumentsWithCompliance,
  replaceDocument,
  sanitizeDocumentForResponse,
  uploadDocument,
} from "../src/modules/documents/documents.service";
import { validateDocumentArchive, validateDocumentReplace, validateDocumentUpload, validateDocumentUpdate } from "../src/modules/documents/documents.validators";
import type { AuthActor } from "../src/types/api.types";
import { AppError, ValidationError } from "../src/utils/errors";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);
const addDaysIsoDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const documentManagerContext = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  requestId: "req_test",
  companyId: "company_1",
  actorUserId: "user_hr",
  fullName: "HR User",
  email: "hr@example.com",
  roles: ["HR Manager"],
  roleKeys: ["hr_manager"],
  permissions: ["documents.view", "documents.upload", "documents.edit", "documents.download", "documents.view_sensitive"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
  ...overrides,
});

const createDocumentTestEnv = (options: { failAccessLog?: boolean } = {}) => {
  const employees = [
    { id: "emp_foreign", company_id: "company_1", employee_code: "EMP-F", full_name: "Foreign Employee", employee_type: "foreign", primary_outlet_id: "outlet_1", employment_status: "active", deleted_at: null },
    { id: "emp_local", company_id: "company_1", employee_code: "EMP-L", full_name: "Local Employee", employee_type: "local", primary_outlet_id: "outlet_1", employment_status: "active", deleted_at: null },
    { id: "emp_other_company", company_id: "company_2", employee_code: "EMP-X", full_name: "Other Employee", employee_type: "foreign", primary_outlet_id: "outlet_2", employment_status: "active", deleted_at: null },
  ];
  const outlets = [
    { id: "outlet_1", name: "Outlet One" },
    { id: "outlet_2", name: "Outlet Two" },
  ];
  const documents: Array<Record<string, any>> = [];
  const accessLogs: Array<Record<string, any>> = [];
  const auditLogs: Array<Record<string, any>> = [];
  const storedObjects = new Map<string, { body: Uint8Array; httpMetadata: { contentType?: string } }>();

  const employeeFor = (employeeId: string, companyId = "company_1") =>
    employees.find((employee) => employee.company_id === companyId && employee.id === employeeId) ?? null;
  const attachJoins = (document: Record<string, any>): Record<string, any> => {
    const employee = employees.find((candidate) => candidate.id === document.employee_id);
    const outlet = outlets.find((candidate) => candidate.id === employee?.primary_outlet_id);
    return {
      ...document,
      employee_code: employee?.employee_code,
      employee_name: employee?.full_name,
      outlet_id: employee?.primary_outlet_id,
      outlet_name: outlet?.name,
      employee_type: employee?.employee_type,
    };
  };
  const safeDocumentRows = (companyId = "company_1") =>
    documents
      .filter((document) => document.company_id === companyId && !document.deleted_at)
      .map(attachJoins);

  const all = async (sql: string, values: unknown[]) => {
    const normalized = sql.replace(/\s+/g, " ").toLowerCase();
    const companyId = values[0] as string;

    if (normalized.includes("from employee_documents d join employees e") && normalized.includes("order by d.expiry_date")) {
      return safeDocumentRows(companyId);
    }
    if (normalized.includes("from employee_documents d") && normalized.includes("where d.company_id = ? and d.employee_id = ? and d.document_type = ?")) {
      const [, historyCompanyId, employeeId, documentType] = values as string[];
      return safeDocumentRows(historyCompanyId)
        .filter((document) => document.employee_id === employeeId && document.document_type === documentType)
        .sort((left, right) => Number(right.version_number ?? 1) - Number(left.version_number ?? 1));
    }
    if (normalized.includes("from employee_documents d") && normalized.includes("not exists")) {
      const [, latestCompanyId, employeeId] = values as string[];
      const rows = safeDocumentRows(latestCompanyId).filter((document) => document.employee_id === employeeId);
      return rows.filter((document) => !rows.some((candidate) =>
        candidate.document_type === document.document_type &&
        Number(candidate.version_number ?? 1) > Number(document.version_number ?? 1),
      ));
    }
    if (normalized.includes("from document_categories")) return [];
    if (normalized.includes("select employee_id, document_type from employee_documents")) {
      return documents
        .filter((document) => document.company_id === companyId && !document.deleted_at && !["deleted", "archived", "replaced"].includes(document.status))
        .map((document) => ({ employee_id: document.employee_id, document_type: document.document_type }));
    }

    return [];
  };

  const first = async (sql: string, values: unknown[]) => {
    const normalized = sql.replace(/\s+/g, " ").toLowerCase();
    const companyId = values[0] as string;

    if (normalized.includes("count(*) as total from employee_documents")) {
      return { total: safeDocumentRows(companyId).length };
    }
    if (normalized.includes("from employee_documents d") && normalized.includes("where d.company_id = ? and d.id = ?")) {
      const [, documentId] = values as string[];
      const document = documents.find((candidate) => candidate.company_id === companyId && candidate.id === documentId && !candidate.deleted_at);
      return document ? attachJoins(document) : null;
    }
    if (normalized.includes("from employees where company_id = ? and id = ?")) {
      const [, employeeId] = values as string[];
      return employeeFor(employeeId, companyId);
    }
    if (normalized.includes("count(*) as total from document_categories")) return { total: 0 };

    return null;
  };

  const run = async (sql: string, values: unknown[]) => {
    const normalized = sql.replace(/\s+/g, " ").toLowerCase();

    if (normalized.includes("insert into employee_documents")) {
      documents.push({
        id: values[0],
        company_id: values[1],
        employee_id: values[2],
        document_type: values[3],
        file_key: values[4],
        file_name: values[5],
        mime_type: values[6],
        expiry_date: values[7],
        status: "active",
        is_sensitive: values[8],
        uploaded_by: values[9],
        created_by: values[10],
        updated_by: values[11],
        created_at: values[12],
        updated_at: values[13],
        document_number: values[14],
        issue_date: values[15],
        start_date: values[16],
        document_category: values[17],
        driving_license_category: values[18],
        driving_license_category_other: values[19],
        version_number: values[20],
        previous_document_id: values[21],
        notes: values[22],
        replaced_by_document_id: null,
        deleted_at: null,
      });
      return { success: true };
    }

    if (normalized.includes("update employee_documents") && normalized.includes("set status = ?")) {
      const [status, replacedByDocumentId, updatedBy, updatedAt, companyId, documentId] = values as string[];
      const document = documents.find((candidate) => candidate.company_id === companyId && candidate.id === documentId);
      if (document) {
        document.status = status;
        document.replaced_by_document_id = replacedByDocumentId ?? document.replaced_by_document_id;
        document.updated_by = updatedBy;
        document.updated_at = updatedAt;
      }
      return { success: true };
    }

    if (normalized.includes("update employee_documents") && normalized.includes("set status = 'deleted'")) {
      const [deletedAt, updatedAt, companyId, documentId] = values as string[];
      const document = documents.find((candidate) => candidate.company_id === companyId && candidate.id === documentId);
      if (document) {
        document.status = "deleted";
        document.deleted_at = deletedAt;
        document.updated_at = updatedAt;
      }
      return { success: true };
    }

    if (normalized.includes("insert into document_access_logs")) {
      if (options.failAccessLog) throw new Error("access log unavailable");
      accessLogs.push({
        id: values[0],
        company_id: values[1],
        employee_id: values[2],
        document_id: values[3],
        user_id: values[4],
        action: values[5],
        ip_address: values[6],
        user_agent: values[7],
        created_at: values[8],
      });
      return { success: true };
    }

    if (normalized.includes("insert into audit_logs")) {
      auditLogs.push({
        company_id: values[1],
        action: values[4],
        entity_type: values[6],
        entity_id: values[7],
        employee_id: values[8],
        old_value_json: values[15],
        new_value_json: values[16],
        reason: values[17],
      });
      return { success: true };
    }

    return { success: true };
  };

  const prepare = (sql: string) => ({
    bind: (...values: unknown[]) => ({
      first: () => first(sql, values),
      all: async () => ({ results: await all(sql, values) }),
      run: () => run(sql, values),
    }),
    first: () => first(sql, []),
    all: async () => ({ results: await all(sql, []) }),
    run: () => run(sql, []),
  });

  const env = {
    ENVIRONMENT: "test",
    SESSION_SECRET: "test-secret",
    DB: { prepare },
    DOCUMENTS_BUCKET: {
      put: async (key: string, body: Uint8Array, options: { httpMetadata?: { contentType?: string } }) => {
        storedObjects.set(key, { body, httpMetadata: options.httpMetadata ?? {} });
      },
      get: async (key: string) => {
        const object = storedObjects.get(key);
        if (!object) return null;
        return {
          body: object.body,
          httpMetadata: object.httpMetadata,
        };
      },
    },
  } as unknown as Env;

  return { env, documents, accessLogs, auditLogs, storedObjects };
};

const createDocumentRouteEnv = (permissions: string[]) => {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const all = async (sql: string, values: unknown[]) => {
    const normalized = sql.replace(/\s+/g, " ").toLowerCase();
    if (normalized.includes("from user_roles ur") && normalized.includes("join roles r")) {
      return [{ id: "role_hr", role_key: "hr_manager", role_name: "HR Manager" }];
    }
    if (normalized.includes("from role_permissions")) {
      return permissions.map((permission_key) => ({ permission_key }));
    }
    if (normalized.includes("from user_permission_overrides")) return [];
    if (normalized.includes("from user_outlets")) return [{ outlet_id: "outlet_1" }];
    return [];
  };
  const first = async (sql: string, values: unknown[]) => {
    const normalized = sql.replace(/\s+/g, " ").toLowerCase();
    if (normalized.includes("from sessions")) {
      return { id: "session_1", company_id: "company_1", user_id: "user_hr", expires_at: future, revoked_at: null };
    }
    if (normalized === "select * from users where id = ? limit 1") {
      return { id: "user_hr", company_id: "company_1", full_name: "HR User", email: "hr@example.com", status: "active", deleted_at: null };
    }
    if (normalized.includes("from feature_settings")) {
      return { company_id: values[0], feature_key: values[1], is_enabled: 1, status: "active", applies_to_all_outlets: 1, allowed_role_ids_json: null, allowed_outlet_ids_json: null };
    }
    return null;
  };
  const run = async () => ({ success: true });
  const prepare = (sql: string) => ({
    bind: (...values: unknown[]) => ({
      first: () => first(sql, values),
      all: async () => ({ results: await all(sql, values) }),
      run,
    }),
    first: () => first(sql, []),
    all: async () => ({ results: await all(sql, []) }),
    run,
  });
  return { ENVIRONMENT: "test", SESSION_SECRET: "test-secret", DB: { prepare }, now } as unknown as Env;
};

const uploadPayload = (overrides: Record<string, unknown> = {}) => ({
  employee_id: "emp_foreign",
  document_type: "work_permit",
  file_name: "permit.pdf",
  mime_type: "application/pdf",
  content_base64: "SGVsbG8=",
  expiry_date: addDaysIsoDate(120),
  ...overrides,
});

describe("document validators", () => {
  it("accepts allowed document MIME types", () => {
    expect(
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "passport",
        file_name: "passport.pdf",
        mime_type: "application/pdf",
        content_base64: "SGVsbG8=",
      }).mime_type,
    ).toBe("application/pdf");
  });

  it("rejects dangerous MIME types", () => {
    expect(() =>
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "passport",
        file_name: "passport.html",
        mime_type: "text/html",
        content_base64: "SGVsbG8=",
      }),
    ).toThrow(AppError);
  });

  it("blocks direct file key changes", () => {
    expect(() => validateDocumentUpdate({ file_key: "secret-key" })).toThrow(AppError);
  });

  it("rejects uploads without content", () => {
    expect(() =>
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "passport",
        file_name: "passport.pdf",
        mime_type: "application/pdf",
      }),
    ).toThrow(AppError);
  });

  it("rejects text/plain documents", () => {
    expect(() =>
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "passport",
        file_name: "note.txt",
        mime_type: "text/plain",
        content_base64: "SGVsbG8=",
      }),
    ).toThrow(AppError);
  });

  it("accepts foreign employee compliance document types", () => {
    const types = ["work_visa", "medical_certificate", "work_permit", "insurance", "passport"];
    for (const document_type of types) {
      expect(
        validateDocumentUpload({
          employee_id: "emp_1",
          document_type,
          file_name: `${document_type}.pdf`,
          mime_type: "application/pdf",
          content_base64: "SGVsbG8=",
        }).document_type,
      ).toBe(document_type);
    }
  });

  it("requires driving license category only for driving licenses", () => {
    expect(() =>
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "driving_license",
        file_name: "license.pdf",
        mime_type: "application/pdf",
        content_base64: "SGVsbG8=",
      }),
    ).toThrow(ValidationError);

    expect(
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "driving_license",
        driving_license_category: "light_vehicle",
        file_name: "license.pdf",
        mime_type: "application/pdf",
        content_base64: "SGVsbG8=",
      }).driving_license_category,
    ).toBe("light_vehicle");

    expect(
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "insurance",
        file_name: "insurance.pdf",
        mime_type: "application/pdf",
        content_base64: "SGVsbG8=",
      }).driving_license_category,
    ).toBeUndefined();
  });

  it("requires custom detail for driving license category other", () => {
    expect(() =>
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "driving_license",
        driving_license_category: "other",
        file_name: "license.pdf",
        mime_type: "application/pdf",
        content_base64: "SGVsbG8=",
      }),
    ).toThrow(ValidationError);

    expect(
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "driving_license",
        driving_license_category: "other",
        driving_license_category_other: "Forklift",
        file_name: "license.pdf",
        mime_type: "application/pdf",
        content_base64: "SGVsbG8=",
      }).driving_license_category_other,
    ).toBe("Forklift");
  });

  it("rejects driving license category data on non-driving-license documents", () => {
    expect(() =>
      validateDocumentUpload({
        employee_id: "emp_1",
        document_type: "work_permit",
        driving_license_category: "light_vehicle",
        file_name: "permit.pdf",
        mime_type: "application/pdf",
        content_base64: "SGVsbG8=",
      }),
    ).toThrow(ValidationError);
  });

  it("validates replacement reason and archive reason", () => {
    expect(() => validateDocumentArchive({ reason: "" })).toThrow(ValidationError);
    expect(() =>
      validateDocumentReplace({
        employee_id: "emp_1",
        document_type: "work_permit",
        file_name: "permit.pdf",
        mime_type: "application/pdf",
        content_base64: "SGVsbG8=",
        reason: "",
      }),
    ).toThrow(ValidationError);
  });

  it("calculates document expiry status", () => {
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const expired = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

    expect(calculateDocumentValidityStatus({ expiry_date: later, status: "active" })).toBe("active");
    expect(calculateDocumentValidityStatus({ expiry_date: soon, status: "active" })).toBe("expiring_soon");
    expect(calculateDocumentValidityStatus({ expiry_date: expired, status: "active" })).toBe("expired");
    expect(calculateDocumentValidityStatus({ expiry_date: null, status: "active" })).toBe("no_expiry");
    expect(calculateDocumentValidityStatus({ expiry_date: later, status: "replaced" })).toBe("replaced");
  });

  it("treats a document expiring today as expiring soon", () => {
    expect(calculateDocumentValidityStatus({ expiry_date: todayIsoDate(), status: "active" })).toBe("expiring_soon");
  });

  it("archived document display status overrides future expiry", () => {
    expect(calculateDocumentValidityStatus({ expiry_date: addDaysIsoDate(120), status: "archived" })).toBe("archived");
  });

  it("sanitizes document responses so storage internals are never exposed", () => {
    const sanitized = sanitizeDocumentForResponse({
      id: "doc_1",
      document_type: "work_permit",
      file_key: "company/employees/emp_1/private.pdf",
      r2_key: "r2/private.pdf",
      storage_key: "storage/private.pdf",
      internal_storage_path: "bucket/private.pdf",
      signed_url: "https://example.com/signed",
      file_name: "permit.pdf",
      expiry_date: null,
      status: "active",
    });

    expect(sanitized.file_name).toBe("permit.pdf");
    expect(JSON.stringify(sanitized)).not.toMatch(/file_key|r2_key|storage_key|internal_storage_path|signed_url|private\.pdf/i);
  });

  it("builds foreign employee compliance with expected documents and high-priority expired visa/work permit warnings", () => {
    const summary = buildEmployeeDocumentComplianceSummary(
      { id: "emp_1", employee_type: "foreign" },
      [
        { document_type: "passport", status: "active", expiry_date: "2099-01-01" },
        { document_type: "work_permit", status: "active", expiry_date: "2020-01-01" },
      ],
    );

    expect(summary.expected_document_types).toEqual(["passport", "work_visa", "work_permit", "medical_certificate", "insurance", "driving_license"]);
    expect(summary.status).toBe("expired_documents");
    expect(summary.missing_document_types).toEqual(["work_visa", "medical_certificate", "insurance", "driving_license"]);
    expect(summary.expired_document_types).toContain("work_permit");
    expect(summary.high_priority_document_types).toEqual(["work_permit"]);
  });

  it("builds local employee compliance without foreign-only missing document warnings", () => {
    const summary = buildEmployeeDocumentComplianceSummary(
      { id: "emp_2", employee_type: "local" },
      [{ document_type: "national_id", status: "active", expiry_date: null }],
    );

    expect(summary.expected_document_types).toEqual(["national_id", "driving_license", "insurance", "other"]);
    expect(summary.missing_document_types).not.toContain("work_visa");
    expect(summary.missing_document_types).not.toContain("work_permit");
    expect(summary.warning).toBeUndefined();
  });
});

describe("document routes", () => {
  const protectedRoutes = [
    { method: "GET", path: "/api/v1/employees/emp_1/documents/doc_1" },
    { method: "PATCH", path: "/api/v1/employees/emp_1/documents/doc_1" },
    { method: "POST", path: "/api/v1/employees/emp_1/documents/doc_1/replace" },
    { method: "POST", path: "/api/v1/employees/emp_1/documents/doc_1/archive" },
    { method: "GET", path: "/api/v1/employees/emp_1/documents/doc_1/history" },
  ];

  it.each(protectedRoutes)("$method $path is registered and requires authentication", async ({ method, path }) => {
    const response = await app.request(path, { method }, { ENVIRONMENT: "local" } as Env);
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).not.toBe("API_ROUTE_NOT_FOUND");
  });

  it("authenticated user without documents.view cannot list documents", async () => {
    const response = await app.request(
      "/api/v1/documents",
      { headers: { cookie: "hrm_session=test-token" } },
      createDocumentRouteEnv([]),
    );
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("PERMISSION_DENIED");
  });

  it("authenticated user without documents.upload cannot upload documents", async () => {
    const response = await app.request(
      "/api/v1/documents",
      {
        method: "POST",
        headers: { cookie: "hrm_session=test-token", "content-type": "application/json" },
        body: JSON.stringify(uploadPayload()),
      },
      createDocumentRouteEnv(["documents.view"]),
    );
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("PERMISSION_DENIED");
  });

  it("authenticated user without documents.edit cannot archive documents", async () => {
    const response = await app.request(
      "/api/v1/documents/doc_1/archive",
      {
        method: "POST",
        headers: { cookie: "hrm_session=test-token", "content-type": "application/json" },
        body: JSON.stringify({ reason: "Testing permission" }),
      },
      createDocumentRouteEnv(["documents.view"]),
    );
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("PERMISSION_DENIED");
  });
});

describe("document service hardening", () => {
  it("employee document list, detail, global list, upload, replace, and history responses do not expose storage internals", async () => {
    const { env } = createDocumentTestEnv();
    const context = documentManagerContext();

    const uploaded = await uploadDocument(env, context, uploadPayload());
    const detail = await getDocument(env, context, uploaded.document.id);
    const employeeList = await listEmployeeDocumentsWithCompliance(env, context, "emp_foreign");
    const globalList = await listDocuments(env, context, { page: 1, page_size: 25 });
    const replaced = await replaceDocument(env, context, uploaded.document.id, {
      ...uploadPayload({ file_name: "permit-v2.pdf", expiry_date: addDaysIsoDate(180) }),
      reason: "Renewed work permit",
    });
    const history = await getDocumentHistory(env, context, replaced.document.id);

    for (const payload of [uploaded, detail, employeeList, globalList, replaced, history]) {
      expect(JSON.stringify(payload)).not.toMatch(/file_key|r2_key|storage_key|internal_storage_path|signed_url|bucket|company_1\/employees/i);
    }
  });

  it("replacement preserves document version timeline and history newest-first", async () => {
    const { env, documents } = createDocumentTestEnv();
    const context = documentManagerContext();

    const first = await uploadDocument(env, context, uploadPayload({ document_number: "WP-001" }));
    const second = await replaceDocument(env, context, first.document.id, {
      ...uploadPayload({ document_number: "WP-002", file_name: "permit-v2.pdf" }),
      reason: "Renewed permit",
    });
    const history = await getDocumentHistory(env, context, second.document.id);
    const oldRow = documents.find((document) => document.id === first.document.id);
    const newRow = documents.find((document) => document.id === second.document.id);

    expect(oldRow?.status).toBe("replaced");
    expect(oldRow?.replaced_by_document_id).toBe(second.document.id);
    expect(newRow?.status).toBe("active");
    expect(newRow?.previous_document_id).toBe(first.document.id);
    expect(newRow?.version_number).toBe(Number(oldRow?.version_number) + 1);
    expect(history.history.map((document: any) => document.id)).toEqual([second.document.id, first.document.id]);
  });

  it("archive keeps the document visible in history without deleting the file", async () => {
    const { env, documents, storedObjects } = createDocumentTestEnv();
    const context = documentManagerContext();

    const first = await uploadDocument(env, context, uploadPayload());
    const originalStorageKey = documents.find((document) => document.id === first.document.id)?.file_key;
    const archived = await archiveDocument(env, context, first.document.id, { reason: "No longer current" });
    const history = await getDocumentHistory(env, context, first.document.id);

    expect(archived.document.status).toBe("archived");
    expect(history.history.map((document: any) => document.id)).toContain(first.document.id);
    expect(originalStorageKey).toBeTruthy();
    expect(storedObjects.has(originalStorageKey as string)).toBe(true);
  });

  it("replacing an archived document is handled intentionally by linking a new version", async () => {
    const { env } = createDocumentTestEnv();
    const context = documentManagerContext();
    const first = await uploadDocument(env, context, uploadPayload());

    await archiveDocument(env, context, first.document.id, { reason: "No longer current" });
    const replacement = await replaceDocument(env, context, first.document.id, {
      ...uploadPayload({ file_name: "permit-after-archive.pdf" }),
      reason: "Reopened record",
    });

    expect(replacement.previous_document_id).toBe(first.document.id);
  });

  it("foreign employee compliance reports missing, expired, expiring, and complete states", () => {
    const noDocs = buildEmployeeDocumentComplianceSummary({ id: "emp_1", employee_type: "foreign" }, []);
    expect(noDocs.missing_document_types).toEqual(["passport", "work_visa", "work_permit", "medical_certificate", "insurance", "driving_license"]);
    expect(noDocs.warning).toContain("warnings only");

    const partial = buildEmployeeDocumentComplianceSummary(
      { id: "emp_1", employee_type: "foreign" },
      [
        { document_type: "passport", status: "active", expiry_date: addDaysIsoDate(120) },
        { document_type: "work_permit", status: "active", expiry_date: addDaysIsoDate(120) },
      ],
    );
    expect(partial.missing_document_types).toEqual(["work_visa", "medical_certificate", "insurance", "driving_license"]);

    const risky = buildEmployeeDocumentComplianceSummary(
      { id: "emp_1", employee_type: "foreign" },
      [
        { document_type: "work_permit", status: "active", expiry_date: addDaysIsoDate(-1) },
        { document_type: "work_visa", status: "active", expiry_date: addDaysIsoDate(30) },
      ],
    );
    expect(risky.high_priority_document_types).toEqual(["work_permit"]);
    expect(risky.expiring_soon_document_types).toEqual(["work_visa"]);

    const complete = buildEmployeeDocumentComplianceSummary(
      { id: "emp_1", employee_type: "foreign" },
      ["passport", "work_visa", "work_permit", "medical_certificate", "insurance", "driving_license"].map((document_type) => ({
        document_type,
        status: "active",
        expiry_date: addDaysIsoDate(120),
      })),
    );
    expect(complete.status).toBe("complete");
    expect(complete.missing_document_types).toEqual([]);
  });

  it("cross-company employee document upload is denied without leaking document storage data", async () => {
    const { env } = createDocumentTestEnv();

    await expect(
      uploadDocument(env, documentManagerContext(), uploadPayload({ employee_id: "emp_other_company" })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("sensitive document access requires documents.view_sensitive and still returns sanitized metadata", async () => {
    const { env } = createDocumentTestEnv();
    const sensitiveContext = documentManagerContext({ permissions: ["documents.view", "documents.upload", "documents.edit", "documents.download", "documents.view_sensitive"] });
    const uploaded = await uploadDocument(env, sensitiveContext, uploadPayload({ is_sensitive: true }));

    await expect(
      getDocument(env, documentManagerContext({ permissions: ["documents.view"] }), uploaded.document.id),
    ).rejects.toMatchObject({ code: "DOCUMENT_ACCESS_DENIED" });

    const detail = await getDocument(env, sensitiveContext, uploaded.document.id);
    expect(JSON.stringify(detail)).not.toMatch(/file_key|company_1\/employees|signed_url/i);
  });

  it("download writes an access log without storing file keys or signed URLs", async () => {
    const { env, accessLogs } = createDocumentTestEnv();
    const context = documentManagerContext();
    const uploaded = await uploadDocument(env, context, uploadPayload());

    await downloadDocument(env, context, uploaded.document.id);

    expect(accessLogs.some((log) => log.document_id === uploaded.document.id && log.action === "download")).toBe(true);
    expect(JSON.stringify(accessLogs)).not.toMatch(/file_key|signed_url|company_1\/employees/i);
  });

  it("download remains available if access log write fails", async () => {
    const { env } = createDocumentTestEnv({ failAccessLog: true });
    const context = documentManagerContext();
    const uploaded = await uploadDocument(env, context, uploadPayload());

    await expect(downloadDocument(env, context, uploaded.document.id)).resolves.toMatchObject({
      file_name: "permit.pdf",
      mime_type: "application/pdf",
    });
  });

  it("document audit payloads use sanitized values for upload and replace events", async () => {
    const { env, auditLogs } = createDocumentTestEnv();
    const context = documentManagerContext();

    const first = await uploadDocument(env, context, uploadPayload());
    await replaceDocument(env, context, first.document.id, {
      ...uploadPayload({ file_name: "permit-v2.pdf" }),
      reason: "Renewal",
    });

    expect(auditLogs.length).toBeGreaterThan(0);
    expect(JSON.stringify(auditLogs)).not.toMatch(/file_key|company_1\/employees|signed_url|storage_key/i);
  });
});


