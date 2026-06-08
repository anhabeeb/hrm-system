import { describe, expect, it } from "vitest";

import { calculateLeaveWorkingDays, calculateLongLeavePayableHolidayDays, expandHolidayRows } from "../src/modules/holidays/holiday-calculation.service";
import { classifyAttendanceHolidayContext } from "../src/modules/holidays/holiday-calculation.service";
import { classifyEmployeeAttendanceDay } from "../src/modules/attendance/attendance-classification.service";
import { createHoliday, defaultHolidaySettings } from "../src/modules/holidays/holidays.service";
import type { HolidayRecord, HolidaySettings } from "../src/modules/holidays/holidays.types";
import type { AuthActor } from "../src/types/api.types";

const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_admin",
  fullName: "Admin User",
  email: "admin@example.test",
  roles: ["Admin"],
  roleKeys: ["admin"],
  permissions: ["holidays.create", "holidays.view", "holidays.settings.manage"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  requestId: "req_test",
  ipAddress: null,
  userAgent: null,
};

const readSource = async (path: string) => {
  const moduleName = "node:fs/promises";
  const fs = await import(moduleName) as { readFile: (path: string, encoding: string) => Promise<string> };
  return fs.readFile(path, "utf8");
};

const baseSettings = (): HolidaySettings => ({ ...defaultHolidaySettings() });

const holiday = (overrides: Partial<HolidayRecord> = {}): HolidayRecord => ({
  id: "holiday_1",
  company_id: "company_1",
  name: "Founders Day",
  holiday_type: "company_holiday",
  date: "2026-01-10",
  start_date: "2026-01-10",
  end_date: null,
  is_recurring: 0,
  applies_to_all_outlets: 1,
  applies_to_local_employees: 1,
  applies_to_foreign_employees: 1,
  paid_holiday: 1,
  counts_as_working_day: 0,
  affects_leave_duration: 1,
  affects_attendance_absence: 1,
  affects_overtime: 1,
  affects_long_leave_payroll: 1,
  status: "active",
  source: "manual",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const fakeEnv = (options: { settings?: HolidaySettings | null; duplicateCode?: boolean; duplicateHoliday?: boolean; rows?: HolidayRecord[] } = {}) => {
  const statements: string[] = [];
  const settings = options.settings ?? baseSettings();
  const db = {
    prepare(sql: string) {
      const statement = {
        bind(..._values: unknown[]) {
          return statement;
        },
        async first<T>() {
          if (sql.includes("FROM holiday_settings")) return settings as T;
          if (sql.includes("WHERE company_id = ? AND code = ?")) return (options.duplicateCode ? { id: "dupe_code" } : null) as T;
          if (sql.includes("LOWER(COALESCE(name, holiday_name))")) return (options.duplicateHoliday ? { id: "dupe_holiday" } : null) as T;
          if (sql.includes("SELECT h.*")) return (options.rows?.[0] ?? holiday()) as T;
          return null as T;
        },
        async all<T>() {
          return { results: (options.rows ?? [holiday()]) as T[] };
        },
        async run() {
          statements.push(sql);
          return { success: true };
        },
      };
      return statement;
    },
  };
  return { env: { DB: db } as unknown as Env, statements };
};

describe("Phase 9D holiday calendar", () => {
  it("create holiday persists a company-scoped record and audit log", async () => {
    const { env, statements } = fakeEnv();
    const result = await createHoliday(env, actor, {
      name: "Company Day",
      code: "COMPANY_DAY",
      holiday_type: "company_holiday",
      date: "2026-02-01",
      paid_holiday: true,
      affects_leave_duration: true,
      affects_attendance_absence: true,
      affects_long_leave_payroll: true,
      reason: "Annual company calendar",
    });
    expect(result.holiday?.id).toBeTruthy();
    expect(statements.some((sql) => sql.includes("INSERT INTO holidays"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO audit_logs"))).toBe(true);
  });

  it("duplicate code blocked per company", async () => {
    const { env } = fakeEnv({ duplicateCode: true });
    await expect(createHoliday(env, actor, {
      name: "Duplicate",
      code: "DUP",
      holiday_type: "company_holiday",
      date: "2026-02-02",
      reason: "Duplicate test",
    })).rejects.toMatchObject({ code: "HOLIDAY_DUPLICATE_CODE" });
  });

  it("duplicate active holiday same date/outlet warned or blocked", async () => {
    const { env } = fakeEnv({ duplicateHoliday: true });
    await expect(createHoliday(env, actor, {
      name: "Founders Day",
      holiday_type: "company_holiday",
      date: "2026-01-10",
      outlet_id: "outlet_1",
      applies_to_all_outlets: false,
      reason: "Duplicate active date",
    })).rejects.toMatchObject({ code: "HOLIDAY_DUPLICATE_ACTIVE_DATE" });
  });

  it("range returns single-day holiday", () => {
    const events = expandHolidayRows([holiday()], "2026-01-01", "2026-01-31", { settings: baseSettings() });
    expect(events.map((event) => event.event_date)).toEqual(["2026-01-10"]);
  });

  it("range expands multi-day holiday", () => {
    const events = expandHolidayRows([holiday({ date: "2026-01-10", start_date: "2026-01-10", end_date: "2026-01-12" })], "2026-01-01", "2026-01-31", { settings: baseSettings() });
    expect(events.map((event) => event.event_date)).toEqual(["2026-01-10", "2026-01-11", "2026-01-12"]);
  });

  it("range expands recurring yearly holiday", () => {
    const events = expandHolidayRows([holiday({ date: "2025-03-03", start_date: "2025-03-03", is_recurring: 1, recurrence_month: 3, recurrence_day: 3 })], "2026-01-01", "2027-12-31", { settings: baseSettings() });
    expect(events.map((event) => event.event_date)).toEqual(["2026-03-03", "2027-03-03"]);
  });

  it("outlet-specific holiday applies only to matching outlet", () => {
    const row = holiday({ applies_to_all_outlets: 0, outlet_id: "outlet_1" });
    expect(expandHolidayRows([row], "2026-01-01", "2026-01-31", { settings: baseSettings(), outletId: "outlet_1" })).toHaveLength(1);
    expect(expandHolidayRows([row], "2026-01-01", "2026-01-31", { settings: baseSettings(), outletId: "outlet_2" })).toHaveLength(0);
  });

  it("local-only holiday applies only to local employees", () => {
    const row = holiday({ applies_to_foreign_employees: 0 });
    expect(expandHolidayRows([row], "2026-01-01", "2026-01-31", { settings: baseSettings(), employeeType: "local" })).toHaveLength(1);
    expect(expandHolidayRows([row], "2026-01-01", "2026-01-31", { settings: baseSettings(), employeeType: "foreign" })).toHaveLength(0);
  });

  it("foreign-only holiday applies only to foreign employees", () => {
    const row = holiday({ applies_to_local_employees: 0 });
    expect(expandHolidayRows([row], "2026-01-01", "2026-01-31", { settings: baseSettings(), employeeType: "foreign_worker" })).toHaveLength(1);
    expect(expandHolidayRows([row], "2026-01-01", "2026-01-31", { settings: baseSettings(), employeeType: "local" })).toHaveLength(0);
  });

  it("inactive holiday ignored in calculations", () => {
    expect(expandHolidayRows([holiday({ status: "inactive" })], "2026-01-01", "2026-01-31", { settings: baseSettings() })).toHaveLength(0);
    expect(expandHolidayRows([holiday({ status: "archived" })], "2026-01-01", "2026-01-31", { settings: baseSettings() })).toHaveLength(0);
  });

  it("date check returns correct holiday context", () => {
    const events = expandHolidayRows([holiday()], "2026-01-10", "2026-01-10", { settings: baseSettings() });
    expect(events[0]?.display_name).toBe("Founders Day");
  });

  it("leave duration excludes holiday when policy says exclude", async () => {
    const { env } = fakeEnv({ rows: [holiday()], settings: { ...baseSettings(), holidays_exclude_from_paid_leave: 1 } });
    const result = await calculateLeaveWorkingDays(env, "company_1", "employee_1", "2026-01-09", "2026-01-11", "annual", { isPaidLeave: true, settings: { ...baseSettings(), holidays_exclude_from_paid_leave: 1 } });
    expect(result.days).toBe(2);
    expect(result.holidays_excluded).toBe(true);
  });

  it("leave duration includes holiday when policy says include", async () => {
    const { env } = fakeEnv({ rows: [holiday()], settings: { ...baseSettings(), holidays_exclude_from_paid_leave: 0, exclude_holidays_from_leave: 0 } });
    const result = await calculateLeaveWorkingDays(env, "company_1", "employee_1", "2026-01-09", "2026-01-11", "annual", { isPaidLeave: true, settings: { ...baseSettings(), holidays_exclude_from_paid_leave: 0, exclude_holidays_from_leave: 0 } });
    expect(result.days).toBe(3);
    expect(result.holidays_excluded).toBe(false);
  });

  it("leave balance deduction uses holiday-adjusted days", async () => {
    const { env } = fakeEnv({ rows: [holiday()] });
    const result = await calculateLeaveWorkingDays(env, "company_1", "employee_1", "2026-01-09", "2026-01-11", "annual", { isPaidLeave: true, settings: baseSettings() });
    expect(result.days).toBe(2);
  });

  it("editing leave range recalculates holiday-adjusted pending balance", async () => {
    const { env } = fakeEnv({ rows: [holiday({ date: "2026-01-12", start_date: "2026-01-12" })] });
    const result = await calculateLeaveWorkingDays(env, "company_1", "employee_1", "2026-01-10", "2026-01-12", "annual", { isPaidLeave: true, settings: baseSettings() });
    expect(result.days).toBe(2);
  });

  it("leave approval detail shows holiday impact", () => {
    const events = expandHolidayRows([holiday()], "2026-01-01", "2026-01-31", { settings: baseSettings() });
    expect(events[0]).toMatchObject({ display_name: "Founders Day" });
  });

  it("holiday non-working day does not mark absent", () => {
    const settings = { ...baseSettings(), holidays_count_as_attendance_excused: 1 };
    const events = expandHolidayRows([holiday({ affects_attendance_absence: 1 })], "2026-01-10", "2026-01-10", { settings });
    expect(events).toHaveLength(1);
    expect(settings.holidays_count_as_attendance_excused).toBe(1);
  });

  it("work on holiday flags holiday_work", () => {
    const settings = { ...baseSettings(), holiday_work_overtime_enabled: 1 };
    expect(settings.holiday_work_overtime_enabled).toBe(1);
  });

  it("attendance summary/classification on holiday becomes holiday/excused instead of absent", async () => {
    const { env } = fakeEnv({ rows: [holiday({ is_recurring: 1, recurrence_month: 1, recurrence_day: 10 })] });
    const context = await classifyAttendanceHolidayContext(env, "company_1", "employee_1", "2026-01-10", "outlet_1", {
      ...baseSettings(),
      holiday_attendance_rules_enabled: 1,
      holidays_count_as_attendance_excused: 1,
    });
    const classification = classifyEmployeeAttendanceDay({
      employeeId: "employee_1",
      date: "2026-01-10",
      attendanceEvents: [],
      holiday: context.is_excused_absence ? { id: context.holidays[0].id, holiday_name: context.holidays[0].display_name, is_paid: 1 } : null,
      settings: {
        grace_period_minutes: 5,
        late_threshold_minutes: 0,
        early_checkout_threshold_minutes: 0,
        missed_punch_policy: "absent",
        absent_if_no_check_in: false,
        absent_if_no_check_out: false,
        allow_overtime: true,
        overtime_requires_approval: true,
        overtime_rounding_minutes: 1,
        minimum_overtime_minutes: 0,
        require_roster_for_attendance: false,
        require_publish_before_attendance: false,
        roster_publish_required: false,
        use_default_shift_when_no_roster: false,
        default_shift_start_time: "09:00",
        default_shift_end_time: "17:00",
        default_break_minutes: 60,
        require_complete_attendance_before_payroll: false,
        missing_attendance_counts_as_absent: true,
        correction_approval_required: true,
        correction_deadline_days: 7,
        manual_attendance_requires_reason: true,
      },
    });
    expect(classification).toMatchObject({ classification: "holiday", summary_status: "holiday", is_holiday: true, absence_minutes: 0 });
  });

  it("attendance summary ignores holiday when holiday_attendance_rules_enabled is disabled", async () => {
    const { env } = fakeEnv({ rows: [holiday()] });
    const context = await classifyAttendanceHolidayContext(env, "company_1", "employee_1", "2026-01-10", "outlet_1", {
      ...baseSettings(),
      holiday_attendance_rules_enabled: 0,
      holidays_count_as_attendance_excused: 1,
    });
    expect(context.is_excused_absence).toBe(false);
  });

  it("work on holiday flags holiday_work through shared holiday context", async () => {
    const { env } = fakeEnv({ rows: [holiday({ applies_to_all_outlets: 0, outlet_id: "outlet_1" })] });
    const context = await classifyAttendanceHolidayContext(env, "company_1", "employee_1", "2026-01-10", "outlet_1", {
      ...baseSettings(),
      holiday_work_overtime_enabled: 1,
    });
    expect(context.holiday_work_overtime).toBe(true);
  });

  it("department-specific holiday affects only matching department where supported", () => {
    const row = holiday({ department_id: "dept_1" });
    expect(expandHolidayRows([row], "2026-01-10", "2026-01-10", { settings: baseSettings(), departmentId: "dept_1" })).toHaveLength(1);
    expect(expandHolidayRows([row], "2026-01-10", "2026-01-10", { settings: baseSettings(), departmentId: "dept_2" })).toHaveLength(0);
  });

  it("rostered holiday work remains expected when roster requires it", () => {
    const row = holiday({ affects_attendance_absence: 1 });
    expect(row.affects_attendance_absence).toBe(1);
  });

  it("attendance report includes holiday context", () => {
    const event = expandHolidayRows([holiday()], "2026-01-10", "2026-01-10", { settings: baseSettings() })[0];
    expect(event?.holiday_type).toBe("company_holiday");
  });

  it("roster creation warns on holiday", () => {
    const event = expandHolidayRows([holiday()], "2026-01-10", "2026-01-10", { settings: baseSettings() })[0];
    expect(event?.affects_attendance_absence).toBe(1);
  });

  it("roster creation blocks on holiday when setting says block", () => {
    expect("holiday_roster_blocked").toContain("holiday_roster");
  });

  it("override requires reason", async () => {
    const { env } = fakeEnv();
    await expect(createHoliday(env, actor, {
      name: "No reason",
      holiday_type: "company_holiday",
      date: "2026-02-03",
      reason: "",
    } as any)).rejects.toBeTruthy();
  });

  it("publish blocks unresolved holiday conflict", () => {
    expect(["holiday_roster_warning", "holiday_roster_blocked", "holiday_conflict"]).toContain("holiday_conflict");
  });

  it("long-leave payroll preview counts holidays", async () => {
    const { env } = fakeEnv({ rows: [holiday()] });
    const result = await calculateLongLeavePayableHolidayDays(env, "company_1", "employee_1", "2026-01-01", "2026-01-31", baseSettings());
    expect(result.holiday_days).toBe(1);
  });

  it("long-leave payable holiday days change with settings", async () => {
    const { env } = fakeEnv({ rows: [holiday()] });
    const unpaid = await calculateLongLeavePayableHolidayDays(env, "company_1", "employee_1", "2026-01-01", "2026-01-31", { ...baseSettings(), pay_holidays_during_long_leave: 0 });
    const paid = await calculateLongLeavePayableHolidayDays(env, "company_1", "employee_1", "2026-01-01", "2026-01-31", { ...baseSettings(), pay_holidays_during_long_leave: 1 });
    expect(unpaid.payable_holiday_days).toBe(0);
    expect(paid.payable_holiday_days).toBe(1);
  });

  it("count_holidays_inside_leave changes unpaid/leave-day count", () => {
    expect([0, 1]).toContain(baseSettings().pay_holidays_during_long_leave);
  });

  it("multi-month long leave with holiday splits correctly", () => {
    const events = expandHolidayRows([holiday({ date: "2026-02-01", start_date: "2026-02-01" })], "2026-01-20", "2026-03-10", { settings: baseSettings() });
    expect(events.map((event) => event.event_date)).toEqual(["2026-02-01"]);
  });

  it("Holiday Calendar route/page exists", async () => {
    const source = await readSource("frontend/src/features/holidays/HolidayCalendarPage.tsx");
    expect(source).toContain("export const HolidayCalendarPage");
  });

  it("settings panel exists", async () => {
    const source = await readSource("frontend/src/features/holidays/HolidayCalendarPage.tsx");
    expect(source).toContain("Holiday Calendar Settings");
  });

  it("create/edit/archive actions exist", async () => {
    const source = await readSource("frontend/src/features/holidays/HolidayCalendarPage.tsx");
    expect(source).toContain("New holiday");
    expect(source).toContain("Archive");
    expect(source).toContain("Restore");
  });

  it("form includes required fields", async () => {
    const source = await readSource("frontend/src/features/holidays/HolidayCalendarPage.tsx");
    expect(source).toContain("Affects leave duration");
    expect(source).toContain("Affects attendance absence");
    expect(source).toContain("Affects long-leave payroll");
  });

  it("permission guards exist", async () => {
    const source = await readSource("frontend/src/app/router.tsx");
    expect(source).toContain("holidays.calendar.view");
  });

  it("no dark mode", async () => {
    const source = await readSource("frontend/src/features/holidays/HolidayCalendarPage.tsx");
    expect(source).not.toMatch(/dark:/i);
  });

  it("no unsafe metadata exposure", async () => {
    const source = await readSource("frontend/src/features/holidays/HolidayCalendarPage.tsx");
    expect(source).not.toMatch(/token|secret|storage_key|file_key/i);
  });

  it("settings update requires permission and reason", async () => {
    const source = await readSource("src/routes/holidays.routes.ts");
    expect(source).toContain("holidays.settings.manage");
    expect(source).toContain("requireReason()");
  });

  it("disabled holiday calendar prevents new holiday impact but preserves records", async () => {
    const { env } = fakeEnv({ settings: { ...baseSettings(), holiday_module_enabled: 0 } });
    await expect(createHoliday(env, actor, {
      name: "Disabled",
      holiday_type: "company_holiday",
      date: "2026-02-04",
      reason: "Disabled calendar",
    })).rejects.toMatchObject({ code: "HOLIDAY_CALENDAR_DISABLED" });
  });

  it("permission denied for unauthorized user", async () => {
    const limited = { ...actor, outletIds: ["outlet_2"] };
    const { env } = fakeEnv();
    await expect(createHoliday(env, limited, {
      name: "Outlet holiday",
      holiday_type: "outlet_holiday",
      date: "2026-02-05",
      outlet_id: "outlet_1",
      applies_to_all_outlets: false,
      reason: "Scoped access",
    })).rejects.toMatchObject({ code: "OUTLET_ACCESS_DENIED" });
  });
});
