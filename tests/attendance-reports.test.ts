import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../src/modules/attendance/attendance-reports.repository", () => ({
  countDailyReportRows: vi.fn(async () => 1),
  listDailyReportRows: vi.fn(async () => [{
    id: "sum_1",
    employee_id: "emp_1",
    employee_code: "EMP001",
    employee_name: "Aisha",
    attendance_date: "2026-06-01",
    roster_shift_name: "Morning",
    scheduled_start: "08:00",
    scheduled_end: "17:00",
    source_summary: "biometric_device",
    manual_correction: 1,
    attendance_status: "present",
  }]),
  countMonthlyReportRows: vi.fn(async () => 1),
  listMonthlyReportRows: vi.fn(async () => [{
    employee_id: "emp_1",
    employee_code: "EMP001",
    employee_name: "Aisha",
    days_scheduled: 20,
    days_present: 18,
    days_absent: 1,
    missing_punch_days: 1,
    total_scheduled_minutes: 9600,
    total_worked_minutes: 9180,
    attendance_percentage: 90,
  }]),
  listEmployeeEvents: vi.fn(async () => [{
    id: "ev_1",
    employee_id: "emp_1",
    event_date: "2026-06-01",
    event_type: "check_in",
    event_time: "2026-06-01T08:00:00.000Z",
    source: "biometric_device",
    attendance_method: "biometric_device",
    source_device_id: "bio_device_1",
    source_event_id: "tx_1",
    sync_status: "synced",
  }]),
  countExceptionRows: vi.fn(async () => 2),
  listExceptionRows: vi.fn(async () => [
    { id: "conf_1", exception_type: "missing_clock_in", status: "open", severity: "warning" },
    { id: "bio_log_1", exception_type: "unmatched_employee", biometric_user_id: "1023", source_type: "biometric_attendance_log" },
    { id: "bio_log_2", exception_type: "ambiguous_employee", biometric_user_id: "1024", source_type: "biometric_attendance_log" },
    { id: "bio_log_3", exception_type: "invalid_timestamp", biometric_user_id: "1025", source_type: "biometric_attendance_log" },
  ]),
  countDevicePunchRows: vi.fn(async () => 3),
  listDevicePunchRows: vi.fn(async () => [
    { id: "bio_log_1", status: "accepted", attendance_event_id: "att_1", device_name: "Front Door" },
    { id: "bio_log_2", status: "duplicate", duplicate: 1, device_name: "Front Door" },
    { id: "bio_log_3", status: "unmatched_employee", biometric_user_id: "1023", device_name: "Front Door" },
  ]),
  reportSummary: vi.fn(async () => ({
    total_employees_in_scope: 10,
    present: 8,
    absent: 1,
    missing_punches: 1,
    unmatched_device_punches: 1,
    exceptions_open: 2,
  })),
}));

vi.mock("../src/services/permission.service", async () => {
  const actual = await vi.importActual<typeof import("../src/services/permission.service")>("../src/services/permission.service");
  return {
    ...actual,
    canAccessEmployee: vi.fn(async () => true),
  };
});

import app from "../src/app";
import * as repository from "../src/modules/attendance/attendance-reports.repository";
import * as reportService from "../src/modules/attendance/attendance-reports.service";
import { validateAttendanceReportFilters } from "../src/modules/attendance/attendance-reports.validators";
import { ValidationError } from "../src/utils/errors";
import type { AuthActor } from "../src/types/api.types";

const env = {} as Env;
const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_admin",
  fullName: "Admin",
  email: "admin@example.test",
  roles: ["Admin"],
  roleKeys: ["admin"],
  permissions: ["attendance.reports.view", "attendance.exceptions.view", "attendance.device_punches.view"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const createCaptureEnv = (rows: any[] = []) => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const captureEnv = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          calls.push({ sql, values });
          return {
            first: async () => rows[0] ?? { total: 0 },
            all: async () => ({ results: rows }),
          };
        },
      }),
    },
  } as unknown as Env;
  return { env: captureEnv, calls };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("attendance report validators", () => {
  it("daily attendance report enforces bounded date range and page size", () => {
    expect(() => validateAttendanceReportFilters({}, "daily")).toThrow(ValidationError);
    expect(() => validateAttendanceReportFilters({
      from_date: "2026-06-01",
      to_date: "2026-06-30",
      page_size: "500",
    }, "daily")).toThrow(ValidationError);

    const filters = validateAttendanceReportFilters({
      from_date: "2026-06-01",
      to_date: "2026-06-30",
      page_size: "100",
    }, "daily");

    expect(filters.from_date).toBe("2026-06-01");
    expect(filters.page_size).toBe(100);
  });

  it("monthly attendance report accepts month and expands range safely", () => {
    const filters = validateAttendanceReportFilters({ month: "2026-06" }, "monthly");
    expect(filters.from_date).toBe("2026-06-01");
    expect(filters.to_date).toBe("2026-06-31");
  });

  it("employee attendance detail report requires employee visibility target", () => {
    expect(() => validateAttendanceReportFilters({ from_date: "2026-06-01", to_date: "2026-06-02" }, "employee_detail")).toThrow(ValidationError);
  });
});

describe("attendance report service envelopes", () => {
  it("daily attendance report basic success includes export-ready shape and manual correction indicator", async () => {
    const result = await reportService.dailyReport(env, actor, validateAttendanceReportFilters({ from_date: "2026-06-01", to_date: "2026-06-01" }, "daily"));

    expect(result.data[0]).toMatchObject({ manual_correction: 1, source_summary: "biometric_device" });
    expect(result.meta.report).toBe("daily");
    expect(result.filters.from_date).toBe("2026-06-01");
    expect(result.pagination?.page_size).toBe(25);
    expect(result.generated_at).toBeTruthy();
  });

  it("monthly attendance report basic success includes payroll-impact report fields", async () => {
    const result = await reportService.monthlyReport(env, actor, validateAttendanceReportFilters({ month: "2026-06" }, "monthly"));

    expect(result.data[0]).toMatchObject({ days_present: 18, attendance_percentage: 90, total_scheduled_minutes: 9600 });
    expect(result.meta.source_tables).toContain("attendance_daily_summary");
  });

  it("employee attendance detail report includes details when requested", async () => {
    const result = await reportService.employeeReport(env, actor, "emp_1", validateAttendanceReportFilters({
      employee_id: "emp_1",
      from_date: "2026-06-01",
      to_date: "2026-06-02",
      include_details: "true",
    }, "employee_detail"));

    expect(result.data[0]).toHaveProperty("events");
    expect(result.data[0].events[0]).toMatchObject({
      event_type: "check_in",
      source: "biometric_device",
      source_device_id: "bio_device_1",
      source_event_id: "tx_1",
    });
    expect(repository.listEmployeeEvents).toHaveBeenCalled();
  });

  it("exception report includes missing punch and staged biometric exceptions", async () => {
    const result = await reportService.exceptionsReport(env, actor, validateAttendanceReportFilters({ from_date: "2026-06-01", to_date: "2026-06-02" }, "exceptions"));

    expect(result.data.map((row: any) => row.exception_type)).toEqual(expect.arrayContaining([
      "missing_clock_in",
      "unmatched_employee",
      "ambiguous_employee",
      "invalid_timestamp",
    ]));
  });

  it("device punch report lists accepted duplicate and unmatched punches without token hashes", async () => {
    const result = await reportService.devicePunchesReport(env, actor, validateAttendanceReportFilters({ from_date: "2026-06-01", to_date: "2026-06-02" }, "device_punches"));

    expect(result.data.map((row: any) => row.status)).toEqual(expect.arrayContaining(["accepted", "duplicate", "unmatched_employee"]));
    expect(JSON.stringify(result)).not.toContain("token_hash");
    expect(JSON.stringify(result)).not.toContain("api_token_hash");
  });

  it("summary report returns compact report header metrics", async () => {
    const result = await reportService.summaryReport(env, actor, validateAttendanceReportFilters({ date: "2026-06-01" }, "summary"));

    expect(result.data[0]).toMatchObject({ total_employees_in_scope: 10, exceptions_open: 2 });
  });
});

describe("attendance report repository SQL safeguards", () => {
  it("daily report applies company and outlet scoping before pagination", async () => {
    const actualRepository = await vi.importActual<typeof import("../src/modules/attendance/attendance-reports.repository")>(
      "../src/modules/attendance/attendance-reports.repository",
    );
    const captured = createCaptureEnv([]);

    await actualRepository.listDailyReportRows(
      captured.env,
      "company_1",
      validateAttendanceReportFilters({ from_date: "2026-06-01", to_date: "2026-06-01" }, "daily"),
      { isSuperAdmin: false, outletIds: ["outlet_1"] },
    );

    expect(captured.calls[0].sql).toContain("s.company_id = ?");
    expect(captured.calls[0].sql).toContain("s.outlet_id IN (?)");
    expect(captured.calls[0].sql).toContain("LIMIT ? OFFSET ?");
    expect(captured.calls[0].values).toEqual(expect.arrayContaining(["company_1", "outlet_1"]));
  });

  it("summary report scopes exception device punch and offline-device subqueries", async () => {
    const actualRepository = await vi.importActual<typeof import("../src/modules/attendance/attendance-reports.repository")>(
      "../src/modules/attendance/attendance-reports.repository",
    );
    const captured = createCaptureEnv([{ total_employees_in_scope: 0 }]);

    await actualRepository.reportSummary(
      captured.env,
      "company_1",
      validateAttendanceReportFilters({
        from_date: "2026-06-01",
        to_date: "2026-06-02",
        outlet_id: "outlet_1",
      }, "summary"),
      { isSuperAdmin: false, outletIds: ["outlet_1"] },
    );

    const { sql, values } = captured.calls[0];
    expect(sql).toContain("ac.outlet_id IN (?)");
    expect(sql).toContain("bl.outlet_id IN (?)");
    expect(sql).toContain("bd.outlet_id IN (?)");
    expect(sql).toContain("COALESCE(ac.attendance_date, substr(ac.created_at, 1, 10)) >= ?");
    expect(sql).toContain("substr(COALESCE(bl.device_timestamp, bl.event_time), 1, 10) >= ?");
    expect(values.filter((value) => value === "outlet_1").length).toBeGreaterThanOrEqual(4);
  });

  it("monthly report calculates scheduled minutes from published roster shifts and handles overnight shifts", async () => {
    const actualRepository = await vi.importActual<typeof import("../src/modules/attendance/attendance-reports.repository")>(
      "../src/modules/attendance/attendance-reports.repository",
    );
    const captured = createCaptureEnv([]);

    await actualRepository.listMonthlyReportRows(
      captured.env,
      "company_1",
      validateAttendanceReportFilters({ month: "2026-06" }, "monthly"),
      { isSuperAdmin: true, outletIds: [] },
    );

    expect(captured.calls[0].sql).toContain("total_scheduled_minutes");
    expect(captured.calls[0].sql).toContain("rs.status IN ('published', 'completed')");
    expect(captured.calls[0].sql).toContain("THEN 1440 ELSE 0 END");
    expect(captured.calls[0].sql).not.toContain("rs.status IN ('draft'");
  });
});

describe("attendance report route and safety wiring", () => {
  const root = process.cwd();
  const read = (path: string) => readFileSync(resolve(root, path), "utf8");

  it("attendance report routes exist and require authentication, not route-not-found", async () => {
    const response = await app.request(
      "/api/v1/attendance/reports/daily?from_date=2026-06-01&to_date=2026-06-01",
      { method: "GET" },
      { ENVIRONMENT: "test" } as Env,
    );
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).not.toBe("API_ROUTE_NOT_FOUND");
  });

  it("report permissions are enforced and seeded consistently", () => {
    const routes = read("src/routes/attendance.routes.ts");
    const seed = read("seeds/permissions.seed.sql");

    for (const permission of [
      "attendance.reports.view",
      "attendance.exceptions.view",
      "attendance.device_punches.view",
    ]) {
      expect(routes).toContain(permission);
      expect(seed).toContain(permission);
    }
  });

  it("draft roster is ignored when reports use published roster context", () => {
    const repositorySource = read("src/modules/attendance/attendance-reports.repository.ts");

    expect(repositorySource).toContain("rs.status IN ('published', 'completed')");
    expect(repositorySource).not.toContain("rs.status IN ('draft'");
  });

  it("report repository applies company and outlet scoping inside SQL", () => {
    const repositorySource = read("src/modules/attendance/attendance-reports.repository.ts");

    expect(repositorySource).toContain("s.company_id = ?");
    expect(repositorySource).toContain("outlet_id IN");
    expect(repositorySource).toContain("1 = 0");
  });

  it("report response shape includes meta filters pagination and generated_at", () => {
    const controller = read("src/modules/attendance/attendance-reports.controller.ts");
    const service = read("src/modules/attendance/attendance-reports.service.ts");

    expect(controller).toContain("success: true");
    expect(service).toContain("meta:");
    expect(service).toContain("filters,");
    expect(service).toContain("pagination");
    expect(service).toContain("generated_at");
  });
});
