import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { parseCsv } from "../src/modules/imports/imports.parser";
import { getTemplate, IMPORT_TEMPLATES } from "../src/modules/imports/imports.templates";
import * as importsService from "../src/modules/imports/imports.service";
import type { AuthActor } from "../src/types/api.types";

const importPermissions = [
  "imports.view",
  "imports.templates.view",
  "imports.upload",
  "imports.preview",
  "imports.apply",
  "imports.cancel",
  "imports.history.view",
  "imports.errors.view",
  "imports.employee.manage",
  "imports.documents.manage",
  "imports.leave_balances.manage",
  "imports.salary.manage",
  "imports.attendance.manage",
  "imports.holidays.manage",
  "imports.assets.manage",
  "imports.advances_loans.manage",
  "imports.sensitive.manage",
];

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_1",
  fullName: "HR Admin",
  email: "hr@example.test",
  roles: ["HR"],
  roleKeys: ["hr_admin"],
  permissions: importPermissions,
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

type Call = { sql: string; values: unknown[]; method: "first" | "all" | "run" | "batch" };

const countSqlPlaceholders = (sql = "") => (sql.match(/\?/g) ?? []).length;

const employee = (overrides: Record<string, unknown> = {}) => ({
  id: "emp_1",
  company_id: "company_1",
  employee_code: "EMP-001",
  full_name: "Aisha Mohamed",
  employee_type: "local",
  primary_outlet_id: "outlet_1",
  department_id: "dept_1",
  position_id: "pos_1",
  employment_status: "active",
  deleted_at: null,
  ...overrides,
});

const makeEnv = (options: {
  employees?: Record<string, any | null>;
  outlets?: Record<string, any | null>;
  leaveTypes?: Record<string, any | null>;
  holidays?: Record<string, any | null>;
  assets?: Record<string, any | null>;
  documentCategories?: Record<string, any | null>;
  payrollRuns?: Record<string, any | null>;
  attendanceBlock?: any | null;
  salaryHistory?: Record<string, any | null>;
  failRowPersistence?: boolean;
} = {}) => {
  const calls: Call[] = [];
  let job: any | null = null;
  let rows: any[] = [];
  const employees = options.employees ?? { "EMP-001": employee() };
  const outlets = options.outlets ?? { "Male Outlet": { id: "outlet_1", name: "Male Outlet", code: "MLE" }, MLE: { id: "outlet_1", name: "Male Outlet", code: "MLE" }, "Other Outlet": { id: "outlet_2", name: "Other Outlet", code: "OTH" } };
  const leaveTypes = options.leaveTypes ?? { annual: { id: "leave_annual", leave_key: "annual", leave_name: "Annual Leave" } };
  const holidays = options.holidays ?? {};
  const assets = options.assets ?? { "LAP-001": { id: "asset_1", asset_code: "LAP-001", asset_name: "Laptop" } };
  const documentCategories = options.documentCategories ?? {
    passport: { id: "cat_passport", category_key: "passport", category_name: "Passport", status: "active", applies_to_foreign_employee: 1, applies_to_local_employee: 1, requires_expiry_date: 1, is_sensitive: 1 },
    local_id: { id: "cat_local", category_key: "local_id", category_name: "Local ID", status: "active", applies_to_foreign_employee: 0, applies_to_local_employee: 1, requires_expiry_date: 0, is_sensitive: 1 },
    work_permit: { id: "cat_wp", category_key: "work_permit", category_name: "Work Permit", status: "active", applies_to_foreign_employee: 1, applies_to_local_employee: 0, requires_expiry_date: 1, is_sensitive: 1 },
  };
  const payrollRuns = options.payrollRuns ?? {};
  const salaryHistory = options.salaryHistory ?? {};

  const firstFor = async (sql: string, values: unknown[]) => {
    calls.push({ sql, values, method: "first" });
    if (sql.includes("FROM feature_settings")) return { feature_key: values[1], is_enabled: 1, status: "enabled", applies_to_all_outlets: 1, allowed_role_ids_json: null, allowed_outlet_ids_json: null };
    if (sql.includes("FROM import_jobs") && sql.includes("idempotency_key")) return job?.idempotency_key === values[1] ? job : null;
    if (sql.includes("FROM import_jobs") && sql.includes("id = ?")) return job?.id === values[1] ? job : null;
    if (sql.includes("FROM employees") && sql.includes("employee_code")) return employees[String(values[1])] ?? null;
    if (sql.includes("FROM outlets")) return outlets[String(values[1])] ?? outlets[String(values[2])] ?? outlets[String(values[3])] ?? null;
    if (sql.includes("FROM departments")) return { id: "dept_1", code: "HR", name: "HR" };
    if (sql.includes("FROM positions")) return { id: "pos_1", code: "OFFICER", title: "Officer" };
    if (sql.includes("FROM leave_types")) return leaveTypes[String(values[1])] ?? leaveTypes[String(values[2])] ?? null;
    if (sql.includes("FROM document_categories")) return documentCategories[String(values[1])] ?? documentCategories[String(values[2])] ?? documentCategories[String(values[3])] ?? null;
    if (sql.includes("FROM holidays")) return holidays[String(values[1])] ?? null;
    if (sql.includes("FROM assets")) return assets[String(values[1])] ?? assets[String(values[2])] ?? null;
    if (sql.includes("FROM attendance_daily_summary") && sql.includes("correction_applied_id")) return options.attendanceBlock ?? null;
    if (sql.includes("FROM payroll_runs")) return payrollRuns[String(values[1])] ?? null;
    if (sql.includes("FROM employee_salary_history") && sql.includes("effective_from")) return salaryHistory[`${values[1]}:${values[2]}`] ?? null;
    if (sql.includes("COUNT(*) AS total FROM import_jobs")) return { total: job ? 1 : 0 };
    if (sql.includes("COUNT(*) AS total FROM import_job_rows")) return { total: rows.length };
    return null;
  };

  const allFor = async (sql: string, values: unknown[]) => {
    calls.push({ sql, values, method: "all" });
    if (sql.includes("FROM import_jobs")) return { results: job ? [job] : [] };
    if (sql.includes("FROM import_job_rows")) {
      const status = sql.includes("status = 'valid'") ? "valid" : sql.includes("status = ?") ? String(values[2]) : null;
      return { results: status ? rows.filter((row) => row.status === status) : rows };
    }
    return { results: [] };
  };

  const runFor = async (sql: string, values: unknown[]) => {
    calls.push({ sql, values, method: "run" });
    let changes = 1;
    if (sql.includes("INSERT INTO import_jobs")) {
      job = {
        id: values[0],
        company_id: values[1],
        import_type: values[2],
        file_name: values[3],
        file_size: values[4],
        file_storage_key: values[5],
        status: values[6],
        mode: values[7],
        total_rows: values[8],
        valid_rows: values[9],
        invalid_rows: values[10],
        created_rows: values[11],
        updated_rows: values[12],
        skipped_rows: values[13],
        failed_rows: values[14],
        duplicate_rows: values[15],
        requested_by: values[16],
        requested_at: values[17],
        validated_at: values[18],
        applied_at: values[19],
        cancelled_at: values[20],
        failure_code: values[21],
        failure_message: values[22],
        idempotency_key: values[23],
        metadata_json: values[24],
        created_at: values[25],
        updated_at: values[26],
      };
    } else if (sql.includes("DELETE FROM import_job_rows")) {
      rows = [];
    } else if (sql.includes("SET status = 'applying'")) {
      changes = job?.status === "preview_ready" ? 1 : 0;
      if (changes) job.status = "applying";
    } else if (sql.includes("SET status = ?") && sql.includes("created_rows")) {
      if (job?.status === "applying") {
        job.status = values[0];
        job.created_rows = values[1];
        job.updated_rows = values[2];
        job.skipped_rows = values[3];
        job.failed_rows = values[4];
        job.applied_at = values[5];
      } else changes = 0;
    } else if (sql.includes("SET status = 'cancelled'")) {
      changes = ["uploaded", "validating", "preview_ready", "validation_failed"].includes(String(job?.status)) ? 1 : 0;
      if (changes) job.status = "cancelled";
    } else if (sql.includes("SET status = 'failed'")) {
      if (job) {
        job.status = "failed";
        job.failure_code = values[0];
        job.failure_message = values[1];
      } else changes = 0;
    } else if (sql.includes("UPDATE import_job_rows SET status = 'applied'")) {
      const row = rows.find((item) => item.id === values[4] && item.status === "valid");
      if (row) {
        row.status = "applied";
        row.target_entity_type = values[0];
        row.target_entity_id = values[1];
      } else changes = 0;
    } else if (sql.includes("UPDATE import_job_rows SET status = 'failed'")) {
      const row = rows.find((item) => item.id === values[4] && item.status === "valid");
      if (row) row.status = "failed";
      else changes = 0;
    }
    return { success: true, meta: { changes }, changes };
  };

  const statement = (sql: string) => ({
    sql,
    bind: (...values: unknown[]) => ({
      sql,
      values,
      first: () => firstFor(sql, values),
      all: () => allFor(sql, values),
      run: () => runFor(sql, values),
    }),
  });

  const env = {
    DB: {
      prepare: statement,
      batch: async (statements: Array<{ sql: string; values: unknown[] }>) => {
        for (const item of statements) {
          calls.push({ sql: item.sql, values: item.values, method: "batch" });
      if (item.sql.includes("INSERT INTO import_job_rows")) {
            if (options.failRowPersistence) throw new Error("row persistence failed");
            rows.push({
              id: item.values[0],
              company_id: item.values[1],
              import_job_id: item.values[2],
              row_number: item.values[3],
              row_data_json: item.values[4],
              normalized_data_json: item.values[5],
              status: item.values[6],
              error_code: item.values[7],
              error_message: item.values[8],
              warnings_json: item.values[9],
              target_entity_type: item.values[10],
              target_entity_id: item.values[11],
              idempotency_key: item.values[12],
              created_at: item.values[13],
              updated_at: item.values[14],
            });
          }
        }
        return statements.map(() => ({ success: true, meta: { changes: 1 } }));
      },
    },
    __calls: calls,
    __state: () => ({ job, rows }),
  };
  return env as unknown as Env & { __calls: Call[]; __state: () => { job: any; rows: any[] } };
};

describe("Phase 12A import templates", () => {
  it("templates list includes supported import types", () => {
    expect(IMPORT_TEMPLATES.map((template) => template.import_type)).toEqual(expect.arrayContaining(["employee_master", "employee_documents", "leave_balances", "salary_compensation", "attendance", "holidays", "assets_uniforms", "advances_loans"]));
  });

  it("employee template has required fields", () => {
    const template = getTemplate("employee_master");
    expect(template?.columns.find((column) => column.key === "full_name")?.required).toBe(true);
    expect(template?.columns.find((column) => column.key === "outlet")?.required).toBe(true);
    expect(template?.columns.find((column) => column.key === "emergency_contact_relation")?.required).toBe(false);
  });

  it("leave balance template has reason field", () => {
    expect(getTemplate("leave_balances")?.columns.find((column) => column.key === "adjustment_reason")?.required).toBe(true);
  });

  it("salary template marked sensitive", () => {
    expect(getTemplate("salary_compensation")?.sensitive).toBe(true);
  });

  it("unsupported template returns error", async () => {
    const env = makeEnv();
    await expect(importsService.getTemplateDetail(env, actor(), "unknown_type")).rejects.toThrow();
  });
});

describe("Phase 12A CSV parser", () => {
  it("CSV parser handles quoted commas and BOM", () => {
    const parsed = parseCsv('\uFEFFemployee_code,full_name\nEMP-001,"Aisha, Mohamed"');
    expect(parsed.headers).toEqual(["employee_code", "full_name"]);
    expect(parsed.rows[0].row.full_name).toBe("Aisha, Mohamed");
  });

  it("CSV parser blocks too many rows", () => {
    const csv = ["employee_code"].concat(Array.from({ length: 5001 }, (_, index) => `EMP-${index}`)).join("\n");
    expect(() => parseCsv(csv)).toThrow(/too many rows/i);
  });

  it("treats formulas as plain text", () => {
    const parsed = parseCsv("employee_code,full_name\nEMP-001,=cmd|calc");
    expect(parsed.rows[0].row.full_name).toBe("'=cmd|calc");
  });
});

describe("Phase 12A import workflow behavior", () => {
  it("preview creates no business records", async () => {
    const env = makeEnv();
    const result = await importsService.previewImport(env, actor(), {
      import_type: "attendance",
      mode: "validate_only",
      csv_content: "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,08:00,Legacy import",
    });
    expect(result.summary.valid_rows).toBe(1);
    expect(env.__calls.some((call) => /INSERT INTO (employees|attendance_events|leave_balances|holidays)/.test(call.sql))).toBe(false);
  });

  it("row-level validation errors returned", async () => {
    const env = makeEnv();
    const result = await importsService.previewImport(env, actor(), {
      import_type: "attendance",
      mode: "validate_only",
      csv_content: "employee_code,attendance_date,reason\nEMP-404,2026-06-08,Legacy import",
    });
    expect(result.summary.invalid_rows).toBe(1);
    expect(result.errors[0].error_code).toBe("IMPORT_REFERENCE_NOT_FOUND");
  });

  it("invalid document category rejected", async () => {
    const env = makeEnv({ documentCategories: { passport: null } });
    const result = await importsService.previewImport(env, actor(), {
      import_type: "employee_documents",
      mode: "validate_only",
      csv_content: "employee_code,document_category,expiry_date,status\nEMP-001,passport,2027-01-01,valid",
    });
    expect(result.errors[0].error_code).toBe("IMPORT_REFERENCE_NOT_FOUND");
  });

  it("inactive category rejected", async () => {
    const env = makeEnv({ documentCategories: { passport: { id: "cat_passport", category_key: "passport", status: "inactive", applies_to_foreign_employee: 1, applies_to_local_employee: 1, requires_expiry_date: 0 } } });
    const result = await importsService.previewImport(env, actor(), {
      import_type: "employee_documents",
      mode: "validate_only",
      csv_content: "employee_code,document_category,status\nEMP-001,passport,valid",
    });
    expect(result.errors[0].error_message).toContain("not active");
  });

  it("foreign-only category rejected for local employee", async () => {
    const env = makeEnv();
    const result = await importsService.previewImport(env, actor(), {
      import_type: "employee_documents",
      mode: "validate_only",
      csv_content: "employee_code,document_category,expiry_date,status\nEMP-001,work_permit,2027-01-01,valid",
    });
    expect(result.errors[0].error_message).toContain("does not apply to local employees");
  });

  it("local-only category rejected for foreign employee", async () => {
    const env = makeEnv({ employees: { "EMP-001": employee({ employee_type: "foreign" }) } });
    const result = await importsService.previewImport(env, actor(), {
      import_type: "employee_documents",
      mode: "validate_only",
      csv_content: "employee_code,document_category,status\nEMP-001,local_id,valid",
    });
    expect(result.errors[0].error_message).toContain("does not apply to foreign employees");
  });

  it("expiry required category rejects missing expiry", async () => {
    const env = makeEnv();
    const result = await importsService.previewImport(env, actor(), {
      import_type: "employee_documents",
      mode: "validate_only",
      csv_content: "employee_code,document_category,status\nEMP-001,passport,valid",
    });
    expect(result.errors[0].error_message).toContain("requires an expiry date");
  });

  it("cross-company references rejected", async () => {
    const env = makeEnv({ employees: { "EMP-OTHER": null } });
    const result = await importsService.previewImport(env, actor(), {
      import_type: "leave_balances",
      mode: "validate_only",
      csv_content: "employee_code,leave_type_code,policy_year,opening_balance,adjustment_reason\nEMP-OTHER,annual,2026,12,Opening migration",
    });
    expect(result.errors[0].error_message).toContain("was not found in this company");
  });

  it("duplicate employee_code blocked in create_only", async () => {
    const env = makeEnv();
    const result = await importsService.previewImport(env, actor(), {
      import_type: "employee_master",
      mode: "create_only",
      csv_content: "employee_code,full_name,employee_type,outlet,join_date,national_id\nEMP-001,Aisha Mohamed,local,Male Outlet,2026-06-01,A000001",
    });
    expect(result.errors[0].error_code).toBe("IMPORT_DUPLICATE_RECORD");
  });

  it("employee master import persists emergency contact relationship", async () => {
    const env = makeEnv({ employees: { "EMP-002": null } });
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "employee_master",
      mode: "create_only",
      csv_content: "employee_code,full_name,employee_type,outlet,join_date,national_id,emergency_contact_name,emergency_contact_phone,emergency_contact_relation\nEMP-002,Fathimath,local,Male Outlet,2026-06-01,A000002,Hassan,+9607111111,Guardian",
    });

    await importsService.applyImportJob(env, actor(), created.job.id);

    const insert = env.__calls.find((call) => call.sql.includes("INSERT INTO employees"));
    expect(insert?.sql).toContain("emergency_contact_relation");
    expect(insert?.values).toContain("Guardian");
    expect(countSqlPlaceholders(insert?.sql)).toBe(insert?.values.length);
  });

  it("outlet-scoped user cannot import employee into unauthorized outlet", async () => {
    const env = makeEnv();
    await expect(importsService.previewImport(env, actor(), {
      import_type: "employee_master",
      mode: "create_only",
      csv_content: "employee_code,full_name,employee_type,outlet,join_date,national_id\nEMP-002,Fathimath,local,Other Outlet,2026-06-01,A000002",
    })).rejects.toMatchObject({ code: "IMPORT_PERMISSION_DENIED" });
  });

  it("leave balance import creates opening ledger transaction and repeated apply is idempotent", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "leave_balances",
      mode: "upsert",
      csv_content: "employee_code,leave_type_code,policy_year,opening_balance,carried_forward,adjustment_reason\nEMP-001,annual,2026,12,2,Opening migration",
      idempotency_key: "leave-openings-2026",
    });
    if (!created.summary) throw new Error("Expected a newly validated import job summary.");
    expect(created.summary.valid_rows).toBe(1);
    const firstApply = await importsService.applyImportJob(env, actor(), created.job.id);
    const secondApply = await importsService.applyImportJob(env, actor(), created.job.id);
    expect(firstApply.summary.updated_rows).toBe(1);
    expect(secondApply.already_applied).toBe(true);
    expect(env.__calls.filter((call) => call.sql.includes("leave_balance_transactions")).length).toBe(1);
  });

  it("salary import requires sensitive permission", async () => {
    const env = makeEnv();
    await expect(importsService.previewImport(env, actor({ permissions: importPermissions.filter((permission) => permission !== "imports.sensitive.manage") }), {
      import_type: "salary_compensation",
      mode: "validate_only",
      csv_content: "employee_code,base_salary,effective_date,reason\nEMP-001,15000,2026-06-01,Approved setup",
    })).rejects.toMatchObject({ code: "IMPORT_SENSITIVE_PERMISSION_REQUIRED" });
  });

  it("attendance import creates source import event", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "attendance",
      mode: "create_only",
      csv_content: "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,08:00,Legacy import",
    });
    await importsService.applyImportJob(env, actor(), created.job.id);
    expect(env.__calls.some((call) => call.sql.includes("attendance_events") && call.sql.includes("'import'"))).toBe(true);
  });

  it("metadata-only import does not falsely satisfy required uploaded document compliance", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "employee_documents",
      mode: "create_only",
      csv_content: "employee_code,document_category,document_number,expiry_date,status\nEMP-001,passport,P1234567,2027-01-01,valid",
    });
    await importsService.applyImportJob(env, actor(), created.job.id);
    const insert = env.__calls.find((call) => call.sql.includes("INSERT OR IGNORE INTO employee_documents"));
    expect(insert?.sql).toContain("metadata/import");
    expect(insert?.values).toContain("pending_file");
    expect(readFileSync("src/modules/hr-reports/hr-reports.repository.ts", "utf8")).toContain("'pending_file'");
  });

  it("sensitive document values are masked in import rows unless imports.sensitive.manage is present", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "employee_documents",
      mode: "create_only",
      csv_content: "employee_code,document_category,document_number,expiry_date,status\nEMP-001,passport,P1234567,2027-01-01,valid",
    });
    const rows = await importsService.listImportRows(env, actor({ permissions: importPermissions.filter((permission) => permission !== "imports.sensitive.manage") }), created.job.id, { page: 1, page_size: 25 });
    expect(rows.data[0].row_data.document_number).toBe("Restricted");
  });

  it("finalized/locked attendance date blocks import", async () => {
    const env = makeEnv({ payrollRuns: { "2026-06": { id: "pay_1", status: "finalized" } } });
    const result = await importsService.previewImport(env, actor(), {
      import_type: "attendance",
      mode: "validate_only",
      csv_content: "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,08:00,Legacy import",
    });
    expect(result.errors[0].error_message).toContain("payroll has been finalized");
  });

  it("manual-corrected date blocks import without override permission", async () => {
    const env = makeEnv({ attendanceBlock: { id: "summary_1", payroll_status: "pending", correction_applied_id: "corr_1" } });
    const result = await importsService.previewImport(env, actor(), {
      import_type: "attendance",
      mode: "validate_only",
      csv_content: "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,08:00,Legacy import",
    });
    expect(result.errors[0].error_message).toContain("manual correction");
  });

  it("successful import triggers summary rebuild or marks pending recalculation", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "attendance",
      mode: "create_only",
      csv_content: "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,08:00,Legacy import",
    });
    await importsService.applyImportJob(env, actor(), created.job.id);
    expect(env.__calls.some((call) => call.sql.includes("pending_recalculation"))).toBe(true);
  });

  it("invalid time/date rejected", async () => {
    const env = makeEnv();
    const result = await importsService.previewImport(env, actor(), {
      import_type: "attendance",
      mode: "validate_only",
      csv_content: "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,not-time,Legacy import",
    });
    expect(result.errors[0].error_message).toContain("Check-in time");
  });

  it("valid holiday imported", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "holidays",
      mode: "create_only",
      csv_content: "holiday_name,holiday_type,date,reason\nNational Day,public_holiday,2026-07-26,Calendar import",
    });
    await importsService.applyImportJob(env, actor(), created.job.id);
    expect(env.__calls.some((call) => call.sql.includes("INSERT INTO holidays"))).toBe(true);
  });

  it("holiday import persists Phase 9D fields from CSV", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "holidays",
      mode: "create_only",
      csv_content: "holiday_name,code,holiday_type,date,end_date,is_recurring,applies_to_local_employees,applies_to_foreign_employees,paid_holiday,affects_leave_duration,affects_attendance_absence,affects_long_leave_payroll,reason\nNational Day,NAT,public_holiday,2026-07-26,2026-07-27,true,false,true,false,false,true,false,Calendar import",
    });
    await importsService.applyImportJob(env, actor(), created.job.id);
    const insert = env.__calls.find((call) => call.sql.includes("INSERT INTO holidays"));
    expect(insert?.sql).toContain("code");
    expect(insert?.sql).toContain("applies_to_local_employees");
    expect(insert?.sql).toContain("affects_leave_duration");
    expect(insert?.values).toContain("NAT");
    expect(insert?.values).toContain(0);
  });

  it("non-outlet holiday import maps paid recurring applicability and affects values exactly", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "holidays",
      mode: "create_only",
      csv_content: "holiday_name,code,holiday_type,date,end_date,is_recurring,applies_to_local_employees,applies_to_foreign_employees,paid_holiday,affects_leave_duration,affects_attendance_absence,affects_long_leave_payroll,reason\nMapping Day,MAP,national_holiday,2026-12-05,2026-12-06,true,false,true,false,false,true,false,Mapping test",
    });
    await importsService.applyImportJob(env, actor(), created.job.id);
    const insert = env.__calls.find((call) => call.method === "run" && call.sql.includes("INSERT INTO holidays"));
    expect(insert).toBeTruthy();
    expect(countSqlPlaceholders(insert?.sql)).toBe(insert?.values.length);
    expect(insert?.values[4]).toBe("MAP");
    expect(insert?.values[9]).toBe(0);
    expect(insert?.values[10]).toBe(0);
    expect(insert?.values[11]).toBe(1);
    expect(insert?.values[12]).toBe(1);
    expect(insert?.values[13]).toBe("yearly");
    expect(insert?.values[14]).toBe(12);
    expect(insert?.values[15]).toBe(5);
    expect(insert?.values[16]).toBe(0);
    expect(insert?.values[17]).toBe(1);
    expect(insert?.values[18]).toBe(0);
    expect(insert?.values[19]).toBe(0);
    expect(insert?.values[20]).toBe(0);
    expect(insert?.values[21]).toBe(0);
    expect(insert?.values[22]).toBe(1);
    expect(insert?.values[23]).toBe(1);
    expect(insert?.values[24]).toBe("Mapping test");
    expect(insert?.values[25]).toBe("user_1");
    expect(insert?.values[26]).toBe("user_1");
  });

  it("outlet-specific holiday import keeps placeholder count and Phase 9D field mapping", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "holidays",
      mode: "create_only",
      csv_content: "holiday_name,code,holiday_type,date,outlet,is_recurring,applies_to_local_employees,applies_to_foreign_employees,paid_holiday,affects_leave_duration,affects_attendance_absence,affects_long_leave_payroll,reason\nOutlet Day,OUT,company_holiday,2026-12-05,Male Outlet,true,true,false,true,true,true,false,Outlet mapping",
    });
    await importsService.applyImportJob(env, actor(), created.job.id);
    const insert = env.__calls.find((call) => call.method === "batch" && call.sql.includes("INSERT INTO holidays"));
    expect(insert).toBeTruthy();
    expect(countSqlPlaceholders(insert?.sql)).toBe(insert?.values.length);
    expect(insert?.values[4]).toBe("OUT");
    expect(insert?.values[9]).toBe(1);
    expect(insert?.values[10]).toBe(1);
    expect(insert?.values[11]).toBe(1);
    expect(insert?.values[12]).toBe(1);
    expect(insert?.values[13]).toBe("yearly");
    expect(insert?.values[16]).toBe("outlet_1");
    expect(insert?.values[17]).toBe(1);
    expect(insert?.values[18]).toBe(0);
    expect(insert?.values[19]).toBe(1);
    expect(insert?.values[20]).toBe(1);
    expect(insert?.values[21]).toBe(0);
    expect(insert?.values[22]).toBe(0);
    expect(insert?.values[23]).toBe(1);
    expect(insert?.values[24]).toBe(1);
    expect(insert?.values[25]).toBe("Outlet mapping");
    expect(env.__calls.some((call) => call.method === "batch" && call.sql.includes("INSERT OR IGNORE INTO holiday_outlets"))).toBe(true);
  });

  it("duplicate holiday code blocked in create_only", async () => {
    const env = makeEnv({ holidays: { DUP: { id: "holiday_existing" } } });
    const result = await importsService.previewImport(env, actor(), {
      import_type: "holidays",
      mode: "create_only",
      csv_content: "holiday_name,code,holiday_type,date,reason\nNational Day,DUP,public_holiday,2026-07-26,Calendar import",
    });
    expect(result.errors[0].error_code).toBe("IMPORT_DUPLICATE_RECORD");
  });

  it("upsert updates existing holiday where safe", async () => {
    const env = makeEnv({ holidays: { UPD: { id: "holiday_existing" } } });
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "holidays",
      mode: "upsert",
      csv_content: "holiday_name,code,holiday_type,date,is_recurring,applies_to_local_employees,applies_to_foreign_employees,paid_holiday,affects_leave_duration,affects_attendance_absence,affects_long_leave_payroll,reason\nUpdated Day,UPD,company_holiday,2026-07-26,true,false,true,false,false,true,false,Calendar import",
    });
    await importsService.applyImportJob(env, actor(), created.job.id);
    const update = env.__calls.find((call) => call.sql.includes("UPDATE holidays SET"));
    expect(update).toBeTruthy();
    expect(countSqlPlaceholders(update?.sql)).toBe(update?.values.length);
    expect(update?.values[2]).toBe("UPD");
    expect(update?.values[7]).toBe(0);
    expect(update?.values[8]).toBe(0);
    expect(update?.values[9]).toBe(1);
    expect(update?.values[10]).toBe(1);
    expect(update?.values[11]).toBe("yearly");
    expect(update?.values[16]).toBe(0);
    expect(update?.values[17]).toBe(1);
    expect(update?.values[18]).toBe(0);
    expect(update?.values[19]).toBe(0);
    expect(update?.values[20]).toBe(0);
    expect(update?.values[21]).toBe(0);
    expect(update?.values[22]).toBe(1);
    expect(update?.values[23]).toBe(1);
  });

  it("finalized payroll period blocks salary import", async () => {
    const env = makeEnv({ payrollRuns: { "2026-06": { id: "pay_1", status: "locked" } } });
    const result = await importsService.previewImport(env, actor(), {
      import_type: "salary_compensation",
      mode: "validate_only",
      csv_content: "employee_code,base_salary,effective_date,reason\nEMP-001,15000,2026-06-01,Approved setup",
    });
    expect(result.errors[0].error_message).toContain("locked payroll period");
  });

  it("reason required for salary import", async () => {
    const env = makeEnv();
    expect(() => parseCsv("employee_code,base_salary,effective_date\nEMP-001,15000,2026-06-01")).not.toThrow();
    await expect(importsService.previewImport(env, actor(), {
      import_type: "salary_compensation",
      mode: "validate_only",
      csv_content: "employee_code,base_salary,effective_date\nEMP-001,15000,2026-06-01",
    })).rejects.toMatchObject({ code: "IMPORT_INVALID_HEADERS" });
  });

  it("cancel blocks later apply", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "attendance",
      mode: "create_only",
      csv_content: "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,08:00,Legacy import",
    });
    await importsService.cancelImportJob(env, actor(), created.job.id);
    await expect(importsService.applyImportJob(env, actor(), created.job.id)).rejects.toMatchObject({ code: "IMPORT_APPLY_BLOCKED" });
  });

  it("repeated apply does not duplicate employee attendance holiday or salary history", async () => {
    for (const [import_type, csv_content] of [
      ["employee_master", "employee_code,full_name,employee_type,outlet,join_date,national_id\nEMP-NEW,New Employee,local,Male Outlet,2026-06-01,A000002"],
      ["attendance", "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,08:00,Legacy import"],
      ["holidays", "holiday_name,code,holiday_type,date,reason\nRepeat Safe,SAFE_DAY,company_holiday,2026-07-26,Calendar import"],
      ["salary_compensation", "employee_code,base_salary,effective_date,reason\nEMP-001,15000,2026-06-01,Approved setup"],
    ] as const) {
      const env = makeEnv({ employees: { "EMP-001": employee(), "EMP-NEW": null } });
      const created = await importsService.createImportJob(env, actor(), { import_type, mode: import_type === "holidays" ? "upsert" : "create_only", csv_content });
      await importsService.applyImportJob(env, actor(), created.job.id);
      const afterFirstApply = env.__calls.filter((call) => /INSERT INTO employees|attendance_events|INSERT INTO holidays|employee_salary_history/.test(call.sql)).length;
      await importsService.applyImportJob(env, actor(), created.job.id);
      const afterSecondApply = env.__calls.filter((call) => /INSERT INTO employees|attendance_events|INSERT INTO holidays|employee_salary_history/.test(call.sql)).length;
      expect(afterSecondApply).toBe(afterFirstApply);
    }
  });

  it("partially completed job behavior is safe and documented", async () => {
    const env = makeEnv();
    const created = await importsService.createImportJob(env, actor(), {
      import_type: "attendance",
      mode: "create_only",
      csv_content: "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,08:00,Legacy import",
    });
    const state = env.__state();
    state.job.status = "partially_completed";
    state.job.failed_rows = 1;
    state.rows[0].status = "failed";
    const result = await importsService.applyImportJob(env, actor(), created.job.id);
    expect(result).toMatchObject({ already_applied: true, partial_retry_exhausted: true });
  });

  it("job creation row insertion failure marks job failed safely", async () => {
    const env = makeEnv({ failRowPersistence: true });
    await expect(importsService.createImportJob(env, actor(), {
      import_type: "attendance",
      mode: "create_only",
      csv_content: "employee_code,attendance_date,check_in_time,reason\nEMP-001,2026-06-08,08:00,Legacy import",
    })).rejects.toThrow("row persistence failed");
    expect(env.__state().job.status).toBe("failed");
  });
});

describe("Phase 12A frontend/static coverage", () => {
  it("Import Center page exists", () => {
    const page = readFileSync("frontend/src/features/imports/ImportCenterPage.tsx", "utf8");
    expect(page).toContain("Navigate");
    expect(page).toContain('to="/import-export"');
    expect(page).not.toContain("dark:");
    expect(page).not.toContain("metadata_json");
  });

  it("legacy import route no longer exposes CSV template UI", () => {
    const page = readFileSync("frontend/src/features/imports/ImportCenterPage.tsx", "utf8");
    expect(page).not.toContain("Template CSV");
    expect(page).not.toContain("downloadTemplate");
    expect(page).not.toContain("csv_content");
  });

  it("import history UI is permission-aware", () => {
    const router = readFileSync("frontend/src/app/router.tsx", "utf8");
    expect(router).toContain("/imports");
    expect(router).toContain("imports.templates.view");
    expect(router).toContain("ImportCenterPage");
  });
});
