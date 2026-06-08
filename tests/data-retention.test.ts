import { describe, expect, it } from "vitest";

import { ARCHIVE_CONFIRMATION_PHRASE } from "../src/modules/data-retention/data-retention.constants";
import * as service from "../src/modules/data-retention/data-retention.service";
import { validateRetentionSettings } from "../src/modules/data-retention/data-retention.validators";
import type { AuthActor } from "../src/types/api.types";
import { AppError, ValidationError } from "../src/utils/errors";

const retentionPermissions = [
  "data_retention.view",
  "data_retention.settings.manage",
  "data_retention.preview",
  "data_retention.archive",
  "data_retention.restore",
  "data_retention.cancel_job",
  "data_retention.audit.view",
  "data_retention.purge",
];

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_admin",
  fullName: "Admin",
  email: "admin@example.test",
  roles: ["Admin"],
  roleKeys: ["admin"],
  permissions: retentionPermissions,
  outletIds: [],
  isAdmin: true,
  isSuperAdmin: false,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

type Call = { sql: string; values: unknown[]; method: "first" | "all" | "run" | "batch" };

const makeEnv = (options: { settings?: Record<string, unknown>; backups?: any[]; employees?: any[]; expiryAlerts?: any[]; attendanceEvents?: any[]; attendanceSummaries?: any[]; attendanceConflicts?: any[]; attendanceCorrections?: any[]; biometricLogs?: any[]; employeeDocuments?: any[]; payrollRuns?: any[]; payrollItems?: any[]; leaveRequests?: any[]; assetAssignments?: any[]; uniformIssues?: any[] } = {}) => {
  const calls: Call[] = [];
  const archiveJobs: any[] = [];
  let archiveItems: any[] = [];
  const tables: Record<string, any[]> = {
    employees: options.employees ?? [
      { id: "emp_old", company_id: "company_1", employment_status: "terminated", terminated_at: "2020-01-01", primary_outlet_id: "outlet_1", department_id: "dept_1", archived_at: null },
      { id: "emp_active", company_id: "company_1", employment_status: "active", updated_at: "2020-01-01", primary_outlet_id: "outlet_1", department_id: "dept_1", archived_at: null },
    ],
    expiry_alerts: options.expiryAlerts ?? [
      { id: "alert_resolved", company_id: "company_1", employee_id: "emp_old", status: "resolved", expiry_date: "2020-01-01", archived_at: null },
      { id: "alert_open", company_id: "company_1", employee_id: "emp_old", status: "open", expiry_date: "2020-01-01", archived_at: null },
    ],
    backup_jobs: options.backups ?? [],
    attendance_events: options.attendanceEvents ?? [
      { id: "att_safe", company_id: "company_1", employee_id: "emp_old", outlet_id: "outlet_1", approval_status: "approved", event_time: "2020-01-01T08:00:00Z", archived_at: null },
    ],
    attendance_daily_summary: options.attendanceSummaries ?? [
      { id: "sum_safe", company_id: "company_1", employee_id: "emp_old", attendance_date: "2020-01-01", payroll_status: "finalized", status: "present" },
    ],
    attendance_conflicts: options.attendanceConflicts ?? [],
    attendance_corrections: options.attendanceCorrections ?? [],
    biometric_attendance_logs: options.biometricLogs ?? [
      { id: "bio_safe", company_id: "company_1", employee_id: "emp_old", outlet_id: "outlet_1", sync_status: "accepted", event_time: "2020-01-01T08:00:00Z", archived_at: null },
    ],
    employee_documents: options.employeeDocuments ?? [],
    payroll_runs: options.payrollRuns ?? [],
    payroll_items: options.payrollItems ?? [],
    leave_requests: options.leaveRequests ?? [],
    long_leave_records: [],
    asset_assignments: options.assetAssignments ?? [],
    uniform_issues: options.uniformIssues ?? [],
  };

  const candidateRows = (sql: string) => {
    if (sql.includes("FROM employees")) {
      return tables.employees.map((row) => ({
        id: row.id,
        employee_id: null,
        primary_outlet_id: row.primary_outlet_id,
        department_id: row.department_id,
        employment_status: row.employment_status,
        date_value: row.terminated_at ?? row.updated_at,
        eligible: ["terminated", "resigned", "offboarded", "inactive", "archived"].includes(row.employment_status) && !row.archived_at ? 1 : 0,
        blocked_reason: ["terminated", "resigned", "offboarded", "inactive", "archived"].includes(row.employment_status) ? null : "Active employee records cannot be archived.",
      }));
    }
    if (sql.includes("FROM expiry_alerts")) {
      return tables.expiry_alerts.map((row) => ({
        id: row.id,
        employee_id: row.employee_id,
        outlet_id: "outlet_1",
        department_id: "dept_1",
        status: row.status,
        date_value: row.expiry_date,
        eligible: ["resolved", "dismissed", "archived"].includes(row.status) && !row.archived_at ? 1 : 0,
        blocked_reason: ["resolved", "dismissed", "archived"].includes(row.status) ? null : "Open or critical expiry alerts cannot be archived.",
      }));
    }
    if (sql.includes("FROM attendance_events")) {
      return tables.attendance_events.map((row) => ({
        id: row.id,
        employee_id: row.employee_id,
        outlet_id: row.outlet_id,
        department_id: "dept_1",
        status: row.approval_status,
        date_value: row.event_time,
        eligible: row.archived_at ? 0 : 1,
        blocked_reason: null,
      }));
    }
    if (sql.includes("FROM biometric_attendance_logs")) {
      return tables.biometric_attendance_logs.map((row) => ({
        id: row.id,
        employee_id: row.employee_id,
        outlet_id: row.outlet_id,
        department_id: "dept_1",
        status: row.sync_status,
        date_value: row.event_time,
        eligible: row.archived_at ? 0 : 1,
        blocked_reason: null,
      }));
    }
    return [];
  };

  const found = (value: boolean) => value ? { found: 1 } : null;

  const firstFor = async (sql: string, values: unknown[]) => {
    calls.push({ sql, values, method: "first" });
    if (sql.includes("FROM company_settings")) return options.settings ? { setting_value_json: JSON.stringify(options.settings) } : null;
    if (sql.includes("FROM backup_jobs") && sql.includes("status = 'completed'")) {
      const minCompletedAt = String(values[1]);
      const nowIso = String(values[2]);
      return tables.backup_jobs.find((row) => row.company_id === values[0] && row.status === "completed" && (row.completed_at ?? row.created_at ?? row.requested_at) >= minCompletedAt && (!row.expires_at || row.expires_at > nowIso) && (row.storage_location || row.content_json)) ?? null;
    }
    if (sql.includes("FROM archive_jobs") && sql.includes("idempotency_key")) return archiveJobs.find((job) => job.idempotency_key === values[1]) ?? null;
    if (sql.includes("FROM archive_jobs") && sql.includes("id = ?")) return archiveJobs.find((job) => job.company_id === values[0] && job.id === values[1]) ?? null;
    if (sql.includes("SELECT 1 AS found FROM leave_requests")) return found(tables.leave_requests.some((row) => row.company_id === values[0] && row.employee_id === values[1] && !["approved", "completed", "rejected", "cancelled"].includes(row.status)));
    if (sql.includes("SELECT 1 AS found FROM long_leave_records")) return found(tables.long_leave_records.some((row) => row.company_id === values[0] && row.employee_id === values[1] && !["completed", "returned", "cancelled", "rejected"].includes(row.status)));
    if (sql.includes("SELECT 1 AS found FROM expiry_alerts")) return found(tables.expiry_alerts.some((row) => row.company_id === values[0] && row.employee_id === values[1] && !["resolved", "dismissed", "archived"].includes(row.status)));
    if (sql.includes("FROM payroll_items pi")) return found(tables.payroll_items.some((item) => item.company_id === values[0] && item.employee_id === values[1] && tables.payroll_runs.some((run) => run.company_id === item.company_id && run.id === item.payroll_run_id && !["finalized", "paid", "locked", "cancelled"].includes(run.status))));
    if (sql.includes("FROM employee_offboarding_cases")) return null;
    if (sql.includes("FROM asset_assignments")) return found(tables.asset_assignments.some((row) => row.company_id === values[0] && row.employee_id === values[1] && !row.returned_date && !["returned", "cancelled", "lost", "archived"].includes(row.status)));
    if (sql.includes("FROM uniform_issues")) return found(tables.uniform_issues.some((row) => row.company_id === values[0] && row.employee_id === values[1] && !row.returned_date && !["returned", "cancelled", "lost", "archived"].includes(row.status)));
    if (sql.includes("FROM employee_documents") && sql.includes("status IN ('pending_file'")) return found(tables.employee_documents.some((row) => row.company_id === values[0] && row.employee_id === values[1] && ["pending_file", "metadata_only", "missing_file", "requires_review"].includes(row.status)));
    if (sql.includes("FROM attendance_daily_summary") && sql.includes("payroll_status NOT IN")) return found(tables.attendance_daily_summary.some((row) => row.company_id === values[0] && row.employee_id === values[1] && row.attendance_date === values[2] && !["finalized", "locked", "paid"].includes(row.payroll_status)));
    if (sql.includes("FROM attendance_daily_summary") && sql.includes("status IN")) return found(tables.attendance_daily_summary.some((row) => row.company_id === values[0] && row.employee_id === values[1] && row.attendance_date === values[2] && ["exception", "pending_review", "missing_clock_in", "missing_clock_out", "review_required"].includes(row.status)));
    if (sql.includes("FROM attendance_conflicts")) return found(tables.attendance_conflicts.some((row) => row.company_id === values[0] && row.employee_id === values[1] && String(row.created_at).slice(0, 10) === values[2] && ["pending", "open"].includes(row.status)));
    if (sql.includes("FROM attendance_corrections")) return found(tables.attendance_corrections.some((row) => row.company_id === values[0] && row.employee_id === values[1] && ["pending", "open", "approved"].includes(row.status) && (row.attendance_event_id === values[2] || String(row.created_at).slice(0, 10) === values[3])));
    if (sql.includes("SELECT * FROM")) {
      const table = sql.match(/FROM\s+([a-zA-Z0-9_]+)/)?.[1] ?? "";
      return tables[table]?.find((row) => row.company_id === values[0] && row.id === values[1]) ?? null;
    }
    if (sql.includes("SELECT id, employment_status")) return tables.employees.find((row) => row.company_id === values[0] && row.id === values[1]) ?? null;
    return null;
  };

  const allFor = async (sql: string, values: unknown[]) => {
    calls.push({ sql, values, method: "all" });
    if (sql.includes("FROM archive_jobs")) return { results: archiveJobs };
    if (sql.includes("FROM archive_job_items")) {
      const status = sql.includes("status = ?") ? values[2] : undefined;
      return { results: archiveItems.filter((item) => item.archive_job_id === values[1] && (!status || item.status === status)) };
    }
    return { results: candidateRows(sql) };
  };

  const runFor = async (sql: string, values: unknown[]) => {
    calls.push({ sql, values, method: "run" });
    let changes = 1;
    if (sql.includes("INSERT INTO archive_jobs")) {
      archiveJobs.push({
        id: values[0],
        company_id: values[1],
        archive_type: values[2],
        source_type: values[3],
        status: "pending",
        requested_by: values[4],
        requested_at: values[5],
        filters_json: values[6],
        reason: values[7],
        idempotency_key: values[8],
        metadata_json: values[9],
        total_candidates: 0,
        eligible_count: 0,
        blocked_count: 0,
        archived_count: 0,
        restored_count: 0,
        skipped_count: 0,
        failed_count: 0,
      });
    } else if (sql.includes("SET status = 'preview_ready'")) {
      const job = archiveJobs.find((row) => row.id === values[5]);
      if (job) {
        job.status = "preview_ready";
        job.total_candidates = values[0];
        job.eligible_count = values[1];
        job.blocked_count = values[2];
      }
    } else if (sql.includes("SET status = 'processing'")) {
      const job = archiveJobs.find((row) => row.id === values[3]);
      changes = job?.status === "preview_ready" ? 1 : 0;
      if (changes && job) job.status = "processing";
    } else if (sql.includes("UPDATE archive_jobs SET status = ?")) {
      const job = archiveJobs.find((row) => row.id === values[11]);
      if (job) {
        job.status = values[0];
        job.archived_count = values[2];
        job.restored_count = values[3];
        job.skipped_count = values[4];
        job.failed_count = values[5];
        job.blocked_count = values[6];
      }
    } else if (sql.includes("UPDATE archive_job_items")) {
      const item = archiveItems.find((row) => row.id === values[7]);
      if (item) {
        item.status = values[0];
        item.new_status = values[1];
        item.blocked_reason = values[2] ?? item.blocked_reason;
      }
    } else if (sql.includes("UPDATE employees SET archived_at = NULL")) {
      const row = tables.employees.find((employee) => employee.company_id === values[3] && employee.id === values[4]);
      changes = row?.archived_at ? 1 : 0;
      if (row && changes) row.archived_at = null;
    } else if (sql.includes("UPDATE employees SET archived_at")) {
      const row = tables.employees.find((employee) => employee.company_id === values[3] && employee.id === values[4]);
      changes = row && !row.archived_at ? 1 : 0;
      if (row && changes) row.archived_at = values[0];
    } else if (sql.includes("UPDATE expiry_alerts SET archived_at")) {
      const row = tables.expiry_alerts.find((alert) => alert.company_id === values[3] && alert.id === values[4]);
      changes = row && !row.archived_at ? 1 : 0;
      if (row && changes) row.archived_at = values[0];
    } else if (sql.includes("UPDATE attendance_events SET archived_at")) {
      const row = tables.attendance_events.find((event) => event.company_id === values[3] && event.id === values[4]);
      changes = row && !row.archived_at ? 1 : 0;
      if (row && changes) row.archived_at = values[0];
    } else if (sql.includes("UPDATE biometric_attendance_logs SET archived_at")) {
      const row = tables.biometric_attendance_logs.find((log) => log.company_id === values[3] && log.id === values[4]);
      changes = row && !row.archived_at ? 1 : 0;
      if (row && changes) row.archived_at = values[0];
    } else if (sql.includes("UPDATE employee_documents SET archived_at = NULL")) {
      const row = tables.employee_documents.find((doc) => doc.company_id === values[3] && doc.id === values[4]);
      changes = row?.archived_at ? 1 : 0;
      if (row && changes) row.archived_at = null;
    } else if (sql.includes("UPDATE payroll_runs SET archived_at = NULL")) {
      const row = tables.payroll_runs.find((run) => run.company_id === values[3] && run.id === values[4]);
      changes = row?.archived_at ? 1 : 0;
      if (row && changes) row.archived_at = null;
    } else if (sql.includes("INSERT INTO audit_logs")) {
      changes = 1;
    } else if (sql.includes("INSERT INTO company_settings")) {
      changes = 1;
    }
    return { meta: { changes } };
  };

  const bindStatement = (sql: string) => ({
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
      prepare: (sql: string) => bindStatement(sql),
      batch: async (statements: Array<{ sql: string; values: unknown[] }>) => {
        calls.push({ sql: "BATCH", values: [], method: "batch" });
        archiveItems = [];
        for (const statement of statements.slice(1)) {
          const values = statement.values;
          archiveItems.push({
            id: values[0],
            company_id: values[1],
            archive_job_id: values[2],
            source_type: values[3],
            source_table: values[4],
            source_id: values[5],
            employee_id: values[6],
            outlet_id: values[7],
            department_id: values[8],
            action: values[9],
            status: values[10],
            reason: values[11],
            warning_code: values[12],
            warning_message: values[13],
            blocked_reason: values[14],
            previous_status: values[15],
            new_status: values[16],
          });
        }
        return [];
      },
    },
  } as unknown as Env;

  return { env, calls, archiveJobs, archiveItems: () => archiveItems, tables };
};

describe("Phase 12C data retention", () => {
  it("settings update requires reason", () => {
    expect(() => validateRetentionSettings({ enabled: true })).toThrow(ValidationError);
  });

  it("purge disabled by default", async () => {
    const { env } = makeEnv();
    const settings = await service.getSettings(env, actor());
    expect(settings.purge_enabled).toBe(false);
    expect(() => validateRetentionSettings({ reason: "No purge", purge_enabled: true })).toThrow(AppError);
  });

  it("preview is read-only", async () => {
    const { env, calls, tables } = makeEnv();
    await service.previewArchive(env, actor(), { source_type: "employees", retention_months: 84, page_size: 25, reason: "Review old employees" });
    expect(tables.employees.every((row) => row.archived_at === null)).toBe(true);
    expect(calls.some((call) => call.sql.includes("UPDATE employees SET archived_at"))).toBe(false);
  });

  it("active employee blocked", async () => {
    const { env, archiveItems } = makeEnv();
    await service.previewArchive(env, actor(), { source_type: "employees", retention_months: 84, page_size: 25, reason: "Review old employees" });
    expect(archiveItems().some((item) => item.source_id === "emp_active" && item.status === "blocked")).toBe(true);
  });

  it("apply requires confirmation", async () => {
    const { env, archiveJobs } = makeEnv();
    const preview = await service.previewArchive(env, actor(), { source_type: "employees", retention_months: 84, page_size: 25, reason: "Review old employees" });
    await expect(service.applyArchiveJob(env, actor(), preview.job.id, { confirmation: "WRONG", reason: "Archive old employees" })).rejects.toMatchObject({ code: "ARCHIVE_CONFIRMATION_REQUIRED" });
    expect(archiveJobs[0].status).toBe("preview_ready");
  });

  it("repeated apply is idempotent", async () => {
    const { env, tables } = makeEnv({ expiryAlerts: [] });
    const preview = await service.previewArchive(env, actor(), { source_type: "employees", retention_months: 84, page_size: 25, reason: "Review old employees" });
    const first = await service.applyArchiveJob(env, actor(), preview.job.id, { confirmation: ARCHIVE_CONFIRMATION_PHRASE, reason: "Archive old employees" });
    const second = await service.applyArchiveJob(env, actor(), preview.job.id, { confirmation: ARCHIVE_CONFIRMATION_PHRASE, reason: "Archive old employees" });
    expect(first.summary.archived_count).toBe(1);
    expect(second).toMatchObject({ already_applied: true });
    expect(tables.employees.filter((row) => row.archived_at).length).toBe(1);
  });

  it("restore archived item succeeds", async () => {
    const { env, tables } = makeEnv({ employees: [{ id: "emp_old", company_id: "company_1", employment_status: "terminated", primary_outlet_id: "outlet_1", department_id: "dept_1", archived_at: "2026-01-01" }] });
    const result = await service.restoreArchivedItem(env, actor(), "employees", "emp_old", { reason: "Restore for HR review" });
    expect(result.status).toBe("restored");
    expect(tables.employees[0].archived_at).toBeNull();
  });

  it("open expiry alert blocked and resolved alert eligible", async () => {
    const { env, archiveItems } = makeEnv();
    await service.previewArchive(env, actor(), { source_type: "expiry_alerts", retention_months: 24, page_size: 25, reason: "Archive resolved alerts" });
    expect(archiveItems().find((item) => item.source_id === "alert_resolved")?.status).toBe("eligible");
    expect(archiveItems().find((item) => item.source_id === "alert_open")?.status).toBe("blocked");
  });

  it("archive apply blocked when require_backup_before_archive is true and no valid backup exists", async () => {
    const { env } = makeEnv({ settings: { require_backup_before_archive: true }, expiryAlerts: [{ id: "alert_resolved", company_id: "company_1", employee_id: "emp_old", status: "resolved", expiry_date: "2020-01-01", archived_at: null }] });
    const preview = await service.previewArchive(env, actor(), { source_type: "expiry_alerts", retention_months: 24, page_size: 25, reason: "Archive resolved alerts" });
    await expect(service.applyArchiveJob(env, actor(), preview.job.id, { confirmation: ARCHIVE_CONFIRMATION_PHRASE, reason: "Archive resolved alerts" })).rejects.toMatchObject({ code: "ARCHIVE_BACKUP_REQUIRED" });
  });

  it("archive apply allowed when a valid completed backup exists", async () => {
    const { env } = makeEnv({
      settings: { require_backup_before_archive: true, backup_required_max_age_days: 30 },
      backups: [{ id: "backup_ok", company_id: "company_1", status: "completed", completed_at: "2026-06-01T00:00:00Z", expires_at: "2026-07-01T00:00:00Z", content_json: "{\"ok\":true}" }],
      expiryAlerts: [{ id: "alert_resolved", company_id: "company_1", employee_id: "emp_old", status: "resolved", expiry_date: "2020-01-01", archived_at: null }],
    });
    const preview = await service.previewArchive(env, actor(), { source_type: "expiry_alerts", retention_months: 24, page_size: 25, reason: "Archive resolved alerts" });
    const result = await service.applyArchiveJob(env, actor(), preview.job.id, { confirmation: ARCHIVE_CONFIRMATION_PHRASE, reason: "Archive resolved alerts" });
    expect(result.summary.archived_count).toBe(1);
  });

  it("expired failed or cancelled backup does not satisfy requirement", async () => {
    const { env } = makeEnv({
      settings: { require_backup_before_archive: true },
      backups: [
        { id: "backup_failed", company_id: "company_1", status: "failed", completed_at: "2026-06-01T00:00:00Z", content_json: "{}" },
        { id: "backup_cancelled", company_id: "company_1", status: "cancelled", completed_at: "2026-06-01T00:00:00Z", content_json: "{}" },
        { id: "backup_expired", company_id: "company_1", status: "completed", completed_at: "2026-06-01T00:00:00Z", expires_at: "2026-06-02T00:00:00Z", content_json: "{}" },
      ],
      expiryAlerts: [{ id: "alert_resolved", company_id: "company_1", employee_id: "emp_old", status: "resolved", expiry_date: "2020-01-01", archived_at: null }],
    });
    const preview = await service.previewArchive(env, actor(), { source_type: "expiry_alerts", retention_months: 24, page_size: 25, reason: "Archive resolved alerts" });
    await expect(service.applyArchiveJob(env, actor(), preview.job.id, { confirmation: ARCHIVE_CONFIRMATION_PHRASE, reason: "Archive resolved alerts" })).rejects.toMatchObject({ code: "ARCHIVE_BACKUP_REQUIRED" });
  });

  it("direct item archive also respects backup requirement", async () => {
    const { env } = makeEnv({ settings: { require_backup_before_archive: true }, expiryAlerts: [{ id: "alert_resolved", company_id: "company_1", employee_id: "emp_old", status: "resolved", expiry_date: "2020-01-01", archived_at: null }] });
    await expect(service.archiveItem(env, actor(), "expiry_alerts", "alert_resolved", { reason: "Archive direct item" })).rejects.toMatchObject({ code: "ARCHIVE_BACKUP_REQUIRED" });
  });

  it("unfinalized payroll attendance date blocked", async () => {
    const { env, archiveItems } = makeEnv({ attendanceSummaries: [{ id: "sum_pending", company_id: "company_1", employee_id: "emp_old", attendance_date: "2020-01-01", payroll_status: "pending", status: "present" }] });
    await service.previewArchive(env, actor(), { source_type: "attendance", retention_months: 24, page_size: 25, reason: "Archive attendance" });
    expect(archiveItems()[0].blocked_reason).toContain("not payroll-finalized");
  });

  it("unresolved attendance exception blocked", async () => {
    const { env, archiveItems } = makeEnv({ attendanceConflicts: [{ id: "conflict_1", company_id: "company_1", employee_id: "emp_old", created_at: "2020-01-01T09:00:00Z", status: "open" }] });
    await service.previewArchive(env, actor(), { source_type: "attendance", retention_months: 24, page_size: 25, reason: "Archive attendance" });
    expect(archiveItems()[0].blocked_reason).toContain("unresolved exception");
  });

  it("manual correction record blocked", async () => {
    const { env, archiveItems } = makeEnv({ attendanceCorrections: [{ id: "correction_1", company_id: "company_1", employee_id: "emp_old", attendance_event_id: "att_safe", created_at: "2020-01-01T09:00:00Z", status: "pending" }] });
    await service.previewArchive(env, actor(), { source_type: "attendance", retention_months: 24, page_size: 25, reason: "Archive attendance" });
    expect(archiveItems()[0].blocked_reason).toContain("Manual correction");
  });

  it("resolved finalized old attendance record eligible", async () => {
    const { env, archiveItems } = makeEnv();
    await service.previewArchive(env, actor(), { source_type: "attendance", retention_months: 24, page_size: 25, reason: "Archive attendance" });
    expect(archiveItems()[0].status).toBe("eligible");
  });

  it("unmatched ambiguous biometric log blocked", async () => {
    const { env, archiveItems } = makeEnv({ biometricLogs: [{ id: "bio_unmatched", company_id: "company_1", employee_id: "emp_old", outlet_id: "outlet_1", sync_status: "unmatched", event_time: "2020-01-01T08:00:00Z", archived_at: null }] });
    await service.previewArchive(env, actor(), { source_type: "biometric_logs", retention_months: 24, page_size: 25, reason: "Archive biometric" });
    expect(archiveItems()[0].blocked_reason).toContain("unresolved");
  });

  it("accepted resolved old biometric log eligible", async () => {
    const { env, archiveItems } = makeEnv();
    await service.previewArchive(env, actor(), { source_type: "biometric_logs", retention_months: 24, page_size: 25, reason: "Archive biometric" });
    expect(archiveItems()[0].status).toBe("eligible");
  });

  it("terminated employee with no open dependencies eligible", async () => {
    const { env, archiveItems } = makeEnv({ expiryAlerts: [] });
    await service.previewArchive(env, actor(), { source_type: "employees", retention_months: 84, page_size: 25, reason: "Review old employees" });
    expect(archiveItems().find((item) => item.source_id === "emp_old")?.status).toBe("eligible");
  });

  it("terminated employee with open leave blocked", async () => {
    const { env, archiveItems } = makeEnv({ expiryAlerts: [], leaveRequests: [{ id: "leave_open", company_id: "company_1", employee_id: "emp_old", status: "pending" }] });
    await service.previewArchive(env, actor(), { source_type: "employees", retention_months: 84, page_size: 25, reason: "Review old employees" });
    expect(archiveItems().find((item) => item.source_id === "emp_old")?.blocked_reason).toContain("open leave");
  });

  it("terminated employee with unresolved expiry alert blocked", async () => {
    const { env, archiveItems } = makeEnv();
    await service.previewArchive(env, actor(), { source_type: "employees", retention_months: 84, page_size: 25, reason: "Review old employees" });
    expect(archiveItems().find((item) => item.source_id === "emp_old")?.blocked_reason).toContain("unresolved expiry");
  });

  it("terminated employee with active asset uniform assignment blocked", async () => {
    const { env, archiveItems } = makeEnv({ expiryAlerts: [], assetAssignments: [{ id: "asset_1", company_id: "company_1", employee_id: "emp_old", status: "issued", returned_date: null }] });
    await service.previewArchive(env, actor(), { source_type: "employees", retention_months: 84, page_size: 25, reason: "Review old employees" });
    expect(archiveItems().find((item) => item.source_id === "emp_old")?.blocked_reason).toContain("unreturned assets");
  });

  it("terminated employee with unfinalized payroll blocked", async () => {
    const { env, archiveItems } = makeEnv({ expiryAlerts: [], payrollRuns: [{ id: "run_1", company_id: "company_1", status: "draft" }], payrollItems: [{ id: "item_1", company_id: "company_1", payroll_run_id: "run_1", employee_id: "emp_old" }] });
    await service.previewArchive(env, actor(), { source_type: "employees", retention_months: 84, page_size: 25, reason: "Review old employees" });
    expect(archiveItems().find((item) => item.source_id === "emp_old")?.blocked_reason).toContain("unfinalized payroll");
  });

  it("restore archived employee does not change terminated resigned status to active", async () => {
    const { env, tables } = makeEnv({ employees: [{ id: "emp_old", company_id: "company_1", employment_status: "terminated", primary_outlet_id: "outlet_1", department_id: "dept_1", archived_at: "2026-01-01" }] });
    await service.restoreArchivedItem(env, actor(), "employees", "emp_old", { reason: "Restore visibility" });
    expect(tables.employees[0].employment_status).toBe("terminated");
  });

  it("restore document with missing file remains metadata pending-file safe", async () => {
    const { env, tables } = makeEnv({ employeeDocuments: [{ id: "doc_1", company_id: "company_1", employee_id: "emp_old", status: "pending_file", file_key: null, archived_at: "2026-01-01" }] });
    await service.restoreArchivedItem(env, actor(), "employee_documents", "doc_1", { reason: "Restore document metadata" });
    expect(tables.employee_documents[0].status).toBe("pending_file");
    expect(tables.employee_documents[0].file_key).toBeNull();
  });

  it("restore payroll does not unlock finalize or change payroll status", async () => {
    const { env, tables } = makeEnv({ payrollRuns: [{ id: "run_1", company_id: "company_1", status: "finalized", archived_at: "2026-01-01" }] });
    await service.restoreArchivedItem(env, actor(), "payroll", "run_1", { reason: "Restore payroll visibility" });
    expect(tables.payroll_runs[0].status).toBe("finalized");
  });

  it("restore blocked when parent employee no longer exists", async () => {
    const { env } = makeEnv({ employees: [], employeeDocuments: [{ id: "doc_1", company_id: "company_1", employee_id: "missing_emp", status: "pending_file", file_key: null, archived_at: "2026-01-01" }] });
    await expect(service.restoreArchivedItem(env, actor(), "employee_documents", "doc_1", { reason: "Restore document metadata" })).rejects.toMatchObject({ code: "ARCHIVE_RESTORE_NOT_ALLOWED" });
  });

  it("restore blocked when allow_restore_from_archive is false", async () => {
    const { env } = makeEnv({ settings: { allow_restore_from_archive: false }, employees: [{ id: "emp_old", company_id: "company_1", employment_status: "terminated", archived_at: "2026-01-01" }] });
    await expect(service.restoreArchivedItem(env, actor(), "employees", "emp_old", { reason: "Restore visibility" })).rejects.toMatchObject({ code: "ARCHIVE_RESTORE_NOT_ALLOWED" });
  });

  it("limited preview messaging includes limit metadata", async () => {
    const { env } = makeEnv({ expiryAlerts: [
      { id: "alert_1", company_id: "company_1", employee_id: "emp_old", status: "resolved", expiry_date: "2020-01-01", archived_at: null },
      { id: "alert_2", company_id: "company_1", employee_id: "emp_old", status: "resolved", expiry_date: "2020-01-01", archived_at: null },
    ] });
    const preview = await service.previewArchive(env, actor(), { source_type: "expiry_alerts", retention_months: 24, page_size: 1, reason: "Archive resolved alerts" });
    expect(preview.meta).toMatchObject({ limited_preview: true, preview_limit: 1, total_estimate: null });
  });
});

describe("Phase 12C static integration", () => {
  it("frontend route and purge disabled UI are present", async () => {
    const { readFileSync } = await import("node:fs");
    const router = readFileSync("frontend/src/app/router.tsx", "utf8");
    const page = readFileSync("frontend/src/features/data-retention/DataRetentionPage.tsx", "utf8");
    expect(router).toContain("/data-retention");
    expect(page).toContain("Archive Preview");
    expect(page).toContain("Archive Jobs");
    expect(page).toContain("Purge is disabled");
    expect(page).not.toContain("dark:");
    expect(page).not.toContain("metadata_json");
  });
});
