import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true })),
}));

vi.mock("../src/modules/payroll/payroll-lock.service", async () => {
  const actual = await vi.importActual<typeof import("../src/modules/payroll/payroll-lock.service")>("../src/modules/payroll/payroll-lock.service");
  return {
    ...actual,
    assertPayrollMonthUnlocked: vi.fn(async () => undefined),
  };
});

import * as payrollLockService from "../src/modules/payroll/payroll-lock.service";
import * as holidayCalculation from "../src/modules/holidays/holiday-calculation.service";
import * as holidayService from "../src/modules/holidays/holidays.service";
import * as repository from "../src/modules/rosters/rosters.repository";
import * as settingsService from "../src/services/settings.service";
import {
  bulkCreateRoster,
  createRosterShift,
  createShiftTemplate,
  publishRoster,
  overrideConflict,
  resolveConflict,
  updateRosterShift,
} from "../src/modules/rosters/rosters.service";
import type { AuthActor } from "../src/types/api.types";
import { LockedRecordError } from "../src/utils/errors";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const context: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_hr",
  fullName: "HR Admin",
  email: "hr@example.test",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions: ["roster.view", "roster.create", "roster.edit", "roster.publish", "roster.view_conflicts", "roster.resolve_conflicts"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const employee = {
  id: "emp_1",
  company_id: "company_1",
  employee_code: "EMP001",
  full_name: "Aisha Mohamed",
  employment_status: "active",
  primary_outlet_id: "outlet_1",
  department_id: "dept_1",
  position_id: "pos_1",
  joined_at: "2026-01-01",
  resigned_at: null,
  terminated_at: null,
  deleted_at: null,
};

const template = {
  id: "shift_1",
  company_id: "company_1",
  outlet_id: null,
  department_id: null,
  name: "Morning",
  code: "MORN",
  start_time: "09:00",
  end_time: "17:00",
  break_minutes: 60,
  crosses_midnight: 0,
  active: 1,
  status: "active",
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

const stubBase = () => {
  vi.spyOn(payrollLockService, "assertPayrollMonthUnlocked").mockResolvedValue(undefined);
  vi.spyOn(settingsService, "getSetting").mockResolvedValue({
    setting_value_json: JSON.stringify({
      allow_roster_overlap_override: false,
      allow_scheduling_on_leave: false,
      allow_scheduling_suspended_employee: false,
      allow_scheduling_on_holidays: true,
    }),
  } as any);
  vi.spyOn(repository, "findEmployee").mockResolvedValue(employee as any);
  vi.spyOn(repository, "findShiftTemplate").mockResolvedValue(template as any);
  vi.spyOn(repository, "findOverlappingShift").mockResolvedValue(null);
  vi.spyOn(repository, "hasApprovedLeaveOnDate").mockResolvedValue(null);
  vi.spyOn(repository, "findHolidayOnDate").mockResolvedValue(null);
  vi.spyOn(holidayService, "getHolidaySettings").mockResolvedValue({
    holiday_module_enabled: 1,
    public_holidays_enabled: 1,
    company_holidays_enabled: 1,
    outlet_specific_holidays_enabled: 1,
    optional_holidays_enabled: 1,
    other_holidays_enabled: 1,
    holiday_leave_rules_enabled: 1,
    holiday_attendance_rules_enabled: 1,
    holiday_roster_rules_enabled: 1,
    holidays_exclude_from_paid_leave: 1,
    holidays_exclude_from_unpaid_leave: 0,
    exclude_holidays_from_leave: 0,
    pay_holidays_during_long_leave: 0,
    holidays_count_as_attendance_excused: 1,
    holiday_work_overtime_enabled: 1,
    replacement_holidays_enabled: 0,
    holiday_import_enabled: 1,
    holiday_approval_required: 0,
    require_reason_for_holiday_changes: 1,
    default_holiday_pay_multiplier: 1.5,
  });
  vi.spyOn(holidayCalculation, "getHolidaysForRange").mockResolvedValue([]);
  vi.spyOn(repository, "hasContractRecords").mockResolvedValue(null);
  vi.spyOn(repository, "hasActiveContractOnDate").mockResolvedValue(null);
  vi.spyOn(repository, "buildCreateRosterStatement").mockReturnValue({} as D1PreparedStatement);
  vi.spyOn(repository, "createConflictStatements").mockReturnValue([]);
  vi.spyOn(repository, "createRosterShiftBatch").mockResolvedValue(undefined);
  vi.spyOn(repository, "updateRosterShift").mockResolvedValue({ success: true } as any);
  vi.spyOn(repository, "clearOpenConflictsForShift").mockResolvedValue({ success: true } as any);
  vi.spyOn(repository, "insertConflicts").mockResolvedValue(undefined);
  vi.spyOn(repository, "findRosterShift").mockResolvedValue({
    id: "roster_1",
    company_id: "company_1",
    outlet_id: "outlet_1",
    employee_id: "emp_1",
    roster_date: "2026-09-01",
    start_time: "09:00",
    end_time: "17:00",
    break_minutes: 60,
    status: "draft",
    source: "manual",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as any);
};

describe("roster schema, routes, and UI", () => {
  it("hardens existing roster tables with scheduling fields and indexes", () => {
    const migration = read("migrations/0033_roster_scheduling_hardening.sql");
    expect(migration).toContain("ALTER TABLE shift_templates ADD COLUMN code");
    expect(migration).toContain("ALTER TABLE roster_shifts ADD COLUMN roster_date");
    expect(migration).toContain("ALTER TABLE roster_conflicts ADD COLUMN detected_at");
    expect(migration).toContain("idx_roster_shifts_company_outlet_date");
    expect(migration).toContain("attendance.roster_rules");
  });

  it("registers roster and shift template API routes", () => {
    expect(read("src/app.ts")).toContain('apiV1.route("/shift-templates", shiftTemplatesRoutes)');
    expect(read("src/app.ts")).toContain('apiV1.route("/rosters", rostersRoutes)');
    expect(read("src/routes/rosters.routes.ts")).toContain('"/bulk"');
    expect(read("src/routes/rosters.routes.ts")).toContain('"/publish"');
    expect(read("src/routes/rosters.routes.ts")).toContain('"/conflicts"');
    expect(read("src/routes/rosters.routes.ts")).toContain('"/conflicts/:id/resolve"');
    expect(read("src/routes/rosters.routes.ts")).toContain('"/conflicts/:id/override"');
  });

  it("frontend roster page uses shared selectors instead of raw id inputs", () => {
    const page = read("frontend/src/features/rosters/RostersPage.tsx");
    expect(page).toContain("OutletCombobox");
    expect(page).toContain("DepartmentCombobox");
    expect(page).toContain("PositionCombobox");
    expect(page).toContain("EmployeeCombobox");
    expect(page).toContain("Bulk create roster");
    expect(page).toContain("Shift Templates");
    expect(page).not.toContain("Outlet ID");
    expect(page).not.toContain("Employee ID");
  });
});

describe("roster service behavior", () => {
  it("creates shift template and rejects duplicate code", async () => {
    vi.spyOn(repository, "findShiftTemplateByCode").mockResolvedValue(null);
    vi.spyOn(repository, "createShiftTemplate").mockResolvedValue({ success: true } as any);
    vi.spyOn(repository, "findShiftTemplate").mockResolvedValue(template as any);

    await createShiftTemplate({} as Env, context, {
      name: "Morning",
      code: "MORN",
      start_time: "09:00",
      end_time: "17:00",
      break_minutes: 60,
    });

    vi.spyOn(repository, "findShiftTemplateByCode").mockResolvedValue({ id: "shift_existing" });
    await expect(createShiftTemplate({} as Env, context, {
      name: "Morning",
      code: "MORN",
      start_time: "09:00",
      end_time: "17:00",
    })).rejects.toMatchObject({ code: "DUPLICATE_SHIFT_TEMPLATE_CODE" });
  });

  it("creates roster shift when employee is eligible", async () => {
    stubBase();
    const result = await createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
    });

    expect(result.roster_shift?.id).toBe("roster_1");
    expect(repository.createRosterShiftBatch).toHaveBeenCalled();
  });

  it("employee on approved leave creates a blocking conflict", async () => {
    stubBase();
    vi.spyOn(repository, "hasApprovedLeaveOnDate").mockResolvedValue({ id: "leave_1" });

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
    })).rejects.toMatchObject({ code: "ROSTER_CONFLICT" });
  });

  it("holiday warning blocks without override", async () => {
    stubBase();
    vi.mocked(holidayCalculation.getHolidaysForRange).mockResolvedValue([{
      id: "holiday_1",
      company_id: "company_1",
      name: "Public Holiday",
      holiday_type: "public_holiday",
      date: "2026-09-01",
      start_date: "2026-09-01",
      event_date: "2026-09-01",
      display_name: "Public Holiday",
      is_recurring: 1,
      applies_to_all_outlets: 1,
      applies_to_local_employees: 1,
      applies_to_foreign_employees: 1,
      paid_holiday: 1,
      counts_as_working_day: 0,
      affects_leave_duration: 1,
      affects_attendance_absence: 1,
      affects_overtime: 1,
      affects_long_leave_payroll: 1,
      affects_roster: 1,
      status: "active",
      source: "manual",
      created_at: "",
      updated_at: "",
    } as any]);

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
    })).rejects.toMatchObject({
      code: "ROSTER_WARNING_REVIEW_REQUIRED",
      details: expect.objectContaining({
        overridable: true,
        conflicts: expect.arrayContaining([
          expect.objectContaining({ conflictType: "holiday_roster_warning", severity: "warning" }),
        ]),
      }),
    });
    expect(repository.createRosterShiftBatch).not.toHaveBeenCalled();
  });

  it("holiday warning allows with override and persists warning conflict", async () => {
    stubBase();
    vi.mocked(holidayCalculation.getHolidaysForRange).mockResolvedValue([{
      id: "holiday_1",
      company_id: "company_1",
      name: "Public Holiday",
      holiday_type: "public_holiday",
      date: "2026-09-01",
      start_date: "2026-09-01",
      event_date: "2026-09-01",
      display_name: "Public Holiday",
      is_recurring: 1,
      applies_to_all_outlets: 1,
      applies_to_local_employees: 1,
      applies_to_foreign_employees: 1,
      paid_holiday: 1,
      counts_as_working_day: 0,
      affects_leave_duration: 1,
      affects_attendance_absence: 1,
      affects_overtime: 1,
      affects_long_leave_payroll: 1,
      affects_roster: 1,
      status: "active",
      source: "manual",
      created_at: "",
      updated_at: "",
    } as any]);

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
      override_warnings: true,
    })).resolves.toMatchObject({ roster_shift: { id: "roster_1" } });

    expect(repository.createConflictStatements).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          conflictType: "holiday_roster_warning",
          severity: "warning",
          message: "This date is marked as a roster-affecting holiday: Public Holiday.",
        }),
      ]),
    );
    expect(repository.createRosterShiftBatch).toHaveBeenCalled();
  });

  it("roster creation on recurring holiday is blocked when holiday scheduling is disabled", async () => {
    stubBase();
    vi.spyOn(settingsService, "getSetting").mockResolvedValue({
      setting_value_json: JSON.stringify({
        allow_scheduling_on_holidays: false,
      }),
    } as any);
    vi.mocked(holidayCalculation.getHolidaysForRange).mockResolvedValue([{
      id: "holiday_1",
      company_id: "company_1",
      name: "Recurring Holiday",
      holiday_type: "public_holiday",
      date: "2025-09-01",
      start_date: "2025-09-01",
      event_date: "2026-09-01",
      display_name: "Recurring Holiday",
      is_recurring: 1,
      recurrence_month: 9,
      recurrence_day: 1,
      applies_to_all_outlets: 1,
      applies_to_local_employees: 1,
      applies_to_foreign_employees: 1,
      paid_holiday: 1,
      counts_as_working_day: 0,
      affects_leave_duration: 1,
      affects_attendance_absence: 1,
      affects_overtime: 1,
      affects_long_leave_payroll: 1,
      affects_roster: 1,
      status: "active",
      source: "manual",
      created_at: "",
      updated_at: "",
    } as any]);

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
      override_warnings: true,
    })).rejects.toMatchObject({
      code: "ROSTER_CONFLICT",
      details: expect.arrayContaining([
        expect.objectContaining({ conflictType: "holiday_roster_blocked", severity: "error" }),
      ]),
    });
  });

  it("error conflicts cannot be overridden", async () => {
    stubBase();
    vi.spyOn(repository, "hasApprovedLeaveOnDate").mockResolvedValue({ id: "leave_1" });

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
      override_warnings: true,
    })).rejects.toMatchObject({ code: "ROSTER_CONFLICT" });
    expect(repository.createRosterShiftBatch).not.toHaveBeenCalled();
  });

  it("overlapping shift is rejected by default", async () => {
    stubBase();
    vi.spyOn(repository, "findOverlappingShift").mockResolvedValue({
      id: "roster_existing",
      roster_date: "2026-09-01",
      start_time: "10:00",
      end_time: "14:00",
      crosses_midnight: 0,
    } as any);

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
    })).rejects.toMatchObject({ code: "ROSTER_CONFLICT" });
  });

  it("detects same-day non-overlapping shifts as safe", async () => {
    stubBase();

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      start_time: "17:00",
      end_time: "21:00",
      roster_date: "2026-09-01",
    })).resolves.toMatchObject({ roster_shift: { id: "roster_1" } });
  });

  it("rejects cross-midnight overlap with a next-day early shift", async () => {
    stubBase();
    vi.spyOn(repository, "findOverlappingShift").mockResolvedValue({
      id: "roster_overnight",
      roster_date: "2026-09-01",
      start_time: "22:00",
      end_time: "06:00",
      crosses_midnight: 1,
    } as any);

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      roster_date: "2026-09-02",
      start_time: "05:00",
      end_time: "09:00",
    })).rejects.toMatchObject({
      code: "ROSTER_CONFLICT",
      message: "This employee already has an overlapping shift across midnight.",
    });
  });

  it("rejects previous-day cross-midnight overlap", async () => {
    stubBase();
    vi.spyOn(repository, "findOverlappingShift").mockResolvedValue({
      id: "roster_early",
      roster_date: "2026-09-02",
      start_time: "05:00",
      end_time: "09:00",
      crosses_midnight: 0,
    } as any);

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      roster_date: "2026-09-01",
      start_time: "22:00",
      end_time: "06:00",
    })).rejects.toMatchObject({
      code: "ROSTER_CONFLICT",
      message: "This employee already has an overlapping shift across midnight.",
    });
  });

  it("allows non-overlapping adjacent shifts after an overnight shift", async () => {
    stubBase();

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      roster_date: "2026-09-02",
      start_time: "09:00",
      end_time: "17:00",
    })).resolves.toMatchObject({ roster_shift: { id: "roster_1" } });
  });

  it("excludes the current roster shift during update overlap checks", async () => {
    stubBase();
    await updateRosterShift({} as Env, context, "roster_1", {
      start_time: "10:00",
      end_time: "18:00",
      reason: "Adjusting roster",
    });

    expect(repository.findOverlappingShift).toHaveBeenCalledWith(
      {},
      "company_1",
      "emp_1",
      "2026-09-01",
      "10:00",
      "18:00",
      "roster_1",
    );
  });

  it("ignores cancelled shifts when checking repository overlap candidates", () => {
    const overnight = repository.rosterShiftWindow({ roster_date: "2026-09-01", start_time: "22:00", end_time: "06:00" });
    const early = repository.rosterShiftWindow({ roster_date: "2026-09-02", start_time: "05:00", end_time: "09:00" });
    const later = repository.rosterShiftWindow({ roster_date: "2026-09-02", start_time: "09:00", end_time: "17:00" });

    expect(repository.rosterWindowsOverlap(overnight, early)).toBe(true);
    expect(repository.rosterWindowsOverlap(overnight, later)).toBe(false);
    expect(read("src/modules/rosters/rosters.repository.ts")).toContain("status <> 'cancelled'");
  });

  it("terminated employee after exit date is rejected", async () => {
    stubBase();
    vi.spyOn(repository, "findEmployee").mockResolvedValue({
      ...employee,
      employment_status: "terminated",
      terminated_at: "2026-08-31",
    } as any);

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
    })).rejects.toMatchObject({ code: "ROSTER_CONFLICT" });
  });

  it("suspended employee is rejected by default", async () => {
    stubBase();
    vi.spyOn(repository, "findEmployee").mockResolvedValue({ ...employee, employment_status: "suspended" } as any);

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
    })).rejects.toMatchObject({ code: "ROSTER_CONFLICT" });
  });

  it("finalized payroll period blocks roster changes", async () => {
    stubBase();
    vi.spyOn(payrollLockService, "assertPayrollMonthUnlocked").mockRejectedValue(new LockedRecordError());

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
    })).rejects.toMatchObject({ code: "ROSTER_CONFLICT" });
  });

  it("bulk roster creates selected employee/day shifts and skips duplicates", async () => {
    stubBase();
    vi.spyOn(repository, "findDuplicateRosterShift")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing" });

    const result = await bulkCreateRoster({} as Env, context, {
      outlet_id: "outlet_1",
      employee_ids: ["emp_1"],
      date_from: "2026-09-01",
      date_to: "2026-09-02",
      days_of_week: [2, 3],
      shift_template_id: "shift_1",
    });

    expect(result.created).toBe(1);
    expect(result.skipped_existing).toBe(1);
  });

  it("publish is blocked by unresolved conflicts", async () => {
    vi.spyOn(payrollLockService, "assertPayrollMonthUnlocked").mockResolvedValue(undefined);
    vi.spyOn(repository, "findLockedAttendanceSummaryInRange").mockResolvedValue(null);
    vi.spyOn(repository, "countOpenBlockingConflictsInRange").mockResolvedValue({ total: 1 });
    const publish = vi.spyOn(repository, "publishRosterRange");

    await expect(publishRoster({} as Env, context, {
      outlet_id: "outlet_1",
      date_from: "2026-09-01",
      date_to: "2026-09-07",
      reason: "Weekly roster approved",
    })).rejects.toMatchObject({ code: "ROSTER_CONFLICT" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("publish blocks open error conflict and allows resolved or overridden conflicts", async () => {
    vi.spyOn(payrollLockService, "assertPayrollMonthUnlocked").mockResolvedValue(undefined);
    vi.spyOn(repository, "findLockedAttendanceSummaryInRange").mockResolvedValue(null);
    const count = vi.spyOn(repository, "countOpenBlockingConflictsInRange").mockResolvedValue({ total: 0 });
    const publish = vi.spyOn(repository, "publishRosterRange").mockResolvedValue({ success: true } as any);

    await publishRoster({} as Env, context, {
      outlet_id: "outlet_1",
      date_from: "2026-09-01",
      date_to: "2026-09-07",
      reason: "Weekly roster approved",
    });

    expect(count).toHaveBeenCalled();
    expect(publish).toHaveBeenCalled();
  });

  it("resolves roster conflict with permission and reason", async () => {
    const conflict = {
      id: "roster_conflict_1",
      company_id: "company_1",
      roster_shift_id: "roster_1",
      employee_id: "emp_1",
      outlet_id: "outlet_1",
      department_id: "dept_1",
      conflict_type: "holiday_conflict",
      severity: "warning",
      message: "Holiday warning",
      status: "open",
      detected_at: "2026-09-01T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
    };
    vi.spyOn(repository, "findConflictById")
      .mockResolvedValueOnce(conflict as any)
      .mockResolvedValueOnce({ ...conflict, status: "resolved" } as any);
    const update = vi.spyOn(repository, "updateConflictStatus").mockResolvedValue({ success: true } as any);

    const result = await resolveConflict({} as Env, context, "roster_conflict_1", { reason: "Reviewed with manager" });

    expect(update).toHaveBeenCalledWith({}, expect.objectContaining({ status: "resolved", resolutionNote: "Reviewed with manager" }));
    expect(result.conflict?.status).toBe("resolved");
  });

  it("overrides roster warning conflict with permission and reason", async () => {
    const conflict = {
      id: "roster_conflict_1",
      company_id: "company_1",
      roster_shift_id: "roster_1",
      employee_id: "emp_1",
      outlet_id: "outlet_1",
      department_id: "dept_1",
      conflict_type: "holiday_conflict",
      severity: "warning",
      message: "Holiday warning",
      status: "open",
      detected_at: "2026-09-01T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
    };
    vi.spyOn(repository, "findConflictById")
      .mockResolvedValueOnce(conflict as any)
      .mockResolvedValueOnce({ ...conflict, status: "overridden" } as any);
    const update = vi.spyOn(repository, "updateConflictStatus").mockResolvedValue({ success: true } as any);

    const result = await overrideConflict({} as Env, context, "roster_conflict_1", { reason: "Manager confirmed coverage" });

    expect(update).toHaveBeenCalledWith({}, expect.objectContaining({ status: "overridden", resolutionNote: "Manager confirmed coverage" }));
    expect(result.conflict?.status).toBe("overridden");
  });

  it("conflict resolution denies users without conflict permission", async () => {
    const limitedContext = {
      ...context,
      permissions: ["roster.view"],
      isAdmin: false,
    };

    await expect(resolveConflict({} as Env, limitedContext, "roster_conflict_1", {
      reason: "Reviewed",
    })).rejects.toMatchObject({ code: "ROSTER_PERMISSION_DENIED" });
  });

  it("publish is blocked by finalized payroll period", async () => {
    vi.spyOn(payrollLockService, "assertPayrollMonthUnlocked").mockRejectedValue(new LockedRecordError());
    vi.spyOn(repository, "findLockedAttendanceSummaryInRange").mockResolvedValue(null);
    const count = vi.spyOn(repository, "countOpenBlockingConflictsInRange");
    const publish = vi.spyOn(repository, "publishRosterRange");

    await expect(publishRoster({} as Env, context, {
      outlet_id: "outlet_1",
      date_from: "2026-09-01",
      date_to: "2026-09-07",
      reason: "Weekly roster approved",
    })).rejects.toMatchObject({ code: "ROSTER_PERIOD_LOCKED" });
    expect(count).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("publish is blocked by partial range overlap with finalized payroll period", async () => {
    vi.spyOn(payrollLockService, "assertPayrollMonthUnlocked")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new LockedRecordError());
    vi.spyOn(repository, "findLockedAttendanceSummaryInRange").mockResolvedValue(null);
    const publish = vi.spyOn(repository, "publishRosterRange");

    await expect(publishRoster({} as Env, context, {
      outlet_id: "outlet_1",
      date_from: "2026-08-31",
      date_to: "2026-09-02",
      reason: "Weekly roster approved",
    })).rejects.toMatchObject({ code: "ROSTER_PERIOD_LOCKED" });
    expect(payrollLockService.assertPayrollMonthUnlocked).toHaveBeenCalledWith({}, "company_1", "2026-08");
    expect(payrollLockService.assertPayrollMonthUnlocked).toHaveBeenCalledWith({}, "company_1", "2026-09");
    expect(publish).not.toHaveBeenCalled();
  });

  it("publish is blocked by locked attendance summary", async () => {
    vi.spyOn(repository, "findLockedAttendanceSummaryInRange").mockResolvedValue({ id: "attendance_locked" });
    const publish = vi.spyOn(repository, "publishRosterRange");

    await expect(publishRoster({} as Env, context, {
      outlet_id: "outlet_1",
      date_from: "2026-09-01",
      date_to: "2026-09-07",
      reason: "Weekly roster approved",
    })).rejects.toMatchObject({ code: "ROSTER_PERIOD_LOCKED" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("super admin cannot publish inside finalized payroll period", async () => {
    vi.spyOn(payrollLockService, "assertPayrollMonthUnlocked").mockRejectedValue(new LockedRecordError());
    vi.spyOn(repository, "findLockedAttendanceSummaryInRange").mockResolvedValue(null);
    const publish = vi.spyOn(repository, "publishRosterRange");
    const superContext = { ...context, isSuperAdmin: true, outletIds: [] };

    await expect(publishRoster({} as Env, superContext, {
      outlet_id: "outlet_1",
      date_from: "2026-09-01",
      date_to: "2026-09-07",
      reason: "Weekly roster approved",
    })).rejects.toMatchObject({ code: "ROSTER_PERIOD_LOCKED" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("publish sets published status when no blocking conflicts exist", async () => {
    vi.spyOn(payrollLockService, "assertPayrollMonthUnlocked").mockResolvedValue(undefined);
    vi.spyOn(repository, "findLockedAttendanceSummaryInRange").mockResolvedValue(null);
    vi.spyOn(repository, "countOpenBlockingConflictsInRange").mockResolvedValue({ total: 0 });
    const publish = vi.spyOn(repository, "publishRosterRange").mockResolvedValue({ success: true } as any);

    await publishRoster({} as Env, context, {
      outlet_id: "outlet_1",
      date_from: "2026-09-01",
      date_to: "2026-09-07",
      reason: "Weekly roster approved",
    });

    expect(publish).toHaveBeenCalled();
  });

  it("cross-outlet scoped access is denied", async () => {
    stubBase();

    await expect(createRosterShift({} as Env, context, {
      outlet_id: "outlet_2",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
    })).rejects.toMatchObject({ code: "OUTLET_ACCESS_DENIED" });
  });

  it("super admin can manage inside company", async () => {
    stubBase();
    const superContext = { ...context, isSuperAdmin: true, outletIds: [] };

    await expect(createRosterShift({} as Env, superContext, {
      outlet_id: "outlet_1",
      employee_id: "emp_1",
      shift_template_id: "shift_1",
      roster_date: "2026-09-01",
    })).resolves.toMatchObject({ roster_shift: { id: "roster_1" } });
  });
});
