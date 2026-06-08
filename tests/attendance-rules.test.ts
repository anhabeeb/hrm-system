import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  findEmployeeForAttendance: vi.fn(),
  listEventsForAttendanceWindow: vi.fn(),
  findDailySummary: vi.fn(),
  findRosterShiftForAttendanceDate: vi.fn(),
  findApprovedLeaveForDate: vi.fn(),
  findAttendanceHolidayForDate: vi.fn(),
  findPayrollRunForMonth: vi.fn(),
  upsertDailySummary: vi.fn(),
  findOpenAttendanceRuleConflict: vi.fn(),
  createAttendanceRuleConflict: vi.fn(),
}));

const settingsMocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
}));

vi.mock("../src/modules/attendance/attendance.repository", () => repositoryMocks);
vi.mock("../src/services/settings.service", () => settingsMocks);

import {
  classifyEmployeeAttendanceDay,
  DEFAULT_ATTENDANCE_RULE_SETTINGS,
  normalizeAttendanceRuleSettings,
} from "../src/modules/attendance/attendance-classification.service";
import { rebuildDailySummary } from "../src/modules/attendance/attendance-summary.service";
import type { AttendanceEventRecord } from "../src/modules/attendance/attendance.types";

const event = (type: "clock_in" | "clock_out", time: string): AttendanceEventRecord => ({
  id: `event_${type}_${time}`,
  company_id: "company_1",
  employee_id: "emp_1",
  outlet_id: "outlet_1",
  device_id: null,
  event_type: type,
  event_time: time,
  attendance_method: "manual",
  source: "manager_dashboard",
  local_id: null,
  created_offline: 0,
  sync_status: "synced",
  approval_status: "approved",
  created_at: time,
  updated_at: time,
});

const classify = (patch: Partial<Parameters<typeof classifyEmployeeAttendanceDay>[0]> = {}) =>
  classifyEmployeeAttendanceDay({
    employeeId: "emp_1",
    date: "2026-09-01",
    rosterShift: {
      id: "roster_1",
      roster_date: "2026-09-01",
      start_time: "09:00",
      end_time: "17:00",
      break_minutes: 60,
    },
    attendanceEvents: [
      event("clock_in", "2026-09-01T09:00:00+05:00"),
      event("clock_out", "2026-09-01T17:00:00+05:00"),
    ],
    approvedLeave: null,
    holiday: null,
    settings: DEFAULT_ATTENDANCE_RULE_SETTINGS,
    employee: { id: "emp_1", employment_status: "active", joined_at: "2026-01-01" },
    ...patch,
  });

describe("attendance day classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies on-time attendance as present", () => {
    const result = classify();
    expect(result.classification).toBe("present");
    expect(result.summary_status).toBe("present");
    expect(result.late_minutes).toBe(0);
    expect(result.early_checkout_minutes).toBe(0);
  });

  it("classifies late attendance after grace period", () => {
    const result = classify({
      attendanceEvents: [
        event("clock_in", "2026-09-01T09:12:00+05:00"),
        event("clock_out", "2026-09-01T17:00:00+05:00"),
      ],
    });
    expect(result.classification).toBe("late");
    expect(result.late_minutes).toBe(7);
  });

  it("classifies early checkout", () => {
    const result = classify({
      attendanceEvents: [
        event("clock_in", "2026-09-01T09:00:00+05:00"),
        event("clock_out", "2026-09-01T16:30:00+05:00"),
      ],
    });
    expect(result.classification).toBe("early_checkout");
    expect(result.early_checkout_minutes).toBe(30);
  });

  it("classifies late and early checkout together", () => {
    const result = classify({
      attendanceEvents: [
        event("clock_in", "2026-09-01T09:20:00+05:00"),
        event("clock_out", "2026-09-01T16:30:00+05:00"),
      ],
    });
    expect(result.classification).toBe("late_and_early_checkout");
  });

  it("detects missing check-in", () => {
    const result = classify({
      attendanceEvents: [event("clock_out", "2026-09-01T17:00:00+05:00")],
    });
    expect(result.classification).toBe("missed_check_in");
    expect(result.summary_status).toBe("missing_clock_in");
    expect(result.rule_conflicts).toEqual([
      expect.objectContaining({ type: "missing_clock_in", severity: "error" }),
    ]);
  });

  it("detects missing check-out", () => {
    const result = classify({
      attendanceEvents: [event("clock_in", "2026-09-01T09:00:00+05:00")],
    });
    expect(result.classification).toBe("missed_check_out");
    expect(result.summary_status).toBe("missing_clock_out");
    expect(result.rule_conflicts).toEqual([
      expect.objectContaining({ type: "missing_clock_out", severity: "error" }),
    ]);
  });

  it("missed punch policy absent maps missing check-in to absent", () => {
    const result = classify({
      attendanceEvents: [event("clock_out", "2026-09-01T17:00:00+05:00")],
      settings: { ...DEFAULT_ATTENDANCE_RULE_SETTINGS, missed_punch_policy: "absent" },
    });
    expect(result.classification).toBe("absent");
    expect(result.summary_status).toBe("absent");
  });

  it("missed punch policy absent maps missing check-out to absent", () => {
    const result = classify({
      attendanceEvents: [event("clock_in", "2026-09-01T09:00:00+05:00")],
      settings: { ...DEFAULT_ATTENDANCE_RULE_SETTINGS, missed_punch_policy: "absent" },
    });
    expect(result.classification).toBe("absent");
    expect(result.summary_status).toBe("absent");
  });

  it("missed punch policy warning keeps missed check-in as warning conflict", () => {
    const result = classify({
      attendanceEvents: [event("clock_out", "2026-09-01T17:00:00+05:00")],
      settings: { ...DEFAULT_ATTENDANCE_RULE_SETTINGS, missed_punch_policy: "warning" },
    });
    expect(result.classification).toBe("missed_check_in");
    expect(result.rule_conflicts).toEqual([
      expect.objectContaining({ type: "missing_clock_in", severity: "warning" }),
    ]);
  });

  it("missed punch policy warning keeps missed check-out as warning conflict", () => {
    const result = classify({
      attendanceEvents: [event("clock_in", "2026-09-01T09:00:00+05:00")],
      settings: { ...DEFAULT_ATTENDANCE_RULE_SETTINGS, missed_punch_policy: "warning" },
    });
    expect(result.classification).toBe("missed_check_out");
    expect(result.rule_conflicts).toEqual([
      expect.objectContaining({ type: "missing_clock_out", severity: "warning" }),
    ]);
  });

  it("absent-if-no-check-in overrides warning policy", () => {
    const result = classify({
      attendanceEvents: [event("clock_out", "2026-09-01T17:00:00+05:00")],
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        absent_if_no_check_in: true,
        missed_punch_policy: "warning",
      },
    });
    expect(result.classification).toBe("absent");
    expect(result.rule_conflicts).toEqual([]);
  });

  it("absent-if-no-check-out overrides warning policy", () => {
    const result = classify({
      attendanceEvents: [event("clock_in", "2026-09-01T09:00:00+05:00")],
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        absent_if_no_check_out: true,
        missed_punch_policy: "warning",
      },
    });
    expect(result.classification).toBe("absent");
    expect(result.rule_conflicts).toEqual([]);
  });

  it("missing day becomes absent only when setting allows it", () => {
    expect(classify({ attendanceEvents: [] }).classification).toBe("incomplete");
    expect(classify({
      attendanceEvents: [],
      settings: { ...DEFAULT_ATTENDANCE_RULE_SETTINGS, missing_attendance_counts_as_absent: true },
    }).classification).toBe("absent");
  });

  it("both punches missing follows missed punch policy", () => {
    expect(classify({
      attendanceEvents: [],
      settings: { ...DEFAULT_ATTENDANCE_RULE_SETTINGS, missed_punch_policy: "absent" },
    }).classification).toBe("absent");

    const warningResult = classify({
      attendanceEvents: [],
      settings: { ...DEFAULT_ATTENDANCE_RULE_SETTINGS, missed_punch_policy: "warning" },
    });
    expect(warningResult.classification).toBe("incomplete");
    expect(warningResult.rule_conflicts).toEqual([
      expect.objectContaining({ type: "incomplete_attendance", severity: "warning" }),
    ]);
  });

  it("paid leave overrides absence", () => {
    const result = classify({
      attendanceEvents: [],
      approvedLeave: { id: "leave_1", is_paid: 1, affects_payroll: 1 },
    });
    expect(result.classification).toBe("paid_leave");
    expect(result.summary_status).toBe("on_leave");
    expect(result.absence_minutes).toBe(0);
  });

  it("approved paid leave with attendance creates attendance-on-leave warning", () => {
    const result = classify({
      approvedLeave: { id: "leave_1", is_paid: 1, affects_payroll: 1 },
    });
    expect(result.classification).toBe("paid_leave");
    expect(result.absence_minutes).toBe(0);
    expect(result.rule_conflicts).toEqual([
      expect.objectContaining({ type: "attendance_on_leave", severity: "warning" }),
    ]);
  });

  it("approved leave without attendance does not create attendance-on-leave conflict", () => {
    const result = classify({
      attendanceEvents: [],
      approvedLeave: { id: "leave_1", is_paid: 1, affects_payroll: 1 },
    });
    expect(result.classification).toBe("paid_leave");
    expect(result.rule_conflicts).toEqual([]);
  });

  it("unpaid leave is not classified as absence", () => {
    const result = classify({
      attendanceEvents: [],
      approvedLeave: { id: "leave_1", is_paid: 0, affects_payroll: 1 },
    });
    expect(result.classification).toBe("unpaid_leave");
    expect(result.summary_status).toBe("on_leave");
    expect(result.is_unpaid_leave).toBe(true);
  });

  it("approved unpaid leave with attendance warns without double absence deduction", () => {
    const result = classify({
      approvedLeave: { id: "leave_1", is_paid: 0, affects_payroll: 1 },
    });
    expect(result.classification).toBe("unpaid_leave");
    expect(result.summary_status).toBe("on_leave");
    expect(result.is_unpaid_leave).toBe(true);
    expect(result.rule_conflicts).toEqual([
      expect.objectContaining({ type: "attendance_on_leave", severity: "warning" }),
    ]);
  });

  it("uses default shift fallback when no roster exists", () => {
    const result = classify({
      rosterShift: null,
      attendanceEvents: [
        event("clock_in", "2026-09-01T09:10:00+05:00"),
        event("clock_out", "2026-09-01T17:00:00+05:00"),
      ],
    });
    expect(result.expected_start).toBe("2026-09-01T09:00:00+05:00");
    expect(result.classification).toBe("late");
  });

  it("roster required plus attendance without roster creates outside-roster conflict", () => {
    const result = classify({
      rosterShift: null,
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        require_roster_for_attendance: true,
        use_default_shift_when_no_roster: false,
      },
    });
    expect(result.rule_conflicts).toEqual([
      expect.objectContaining({ type: "attendance_outside_roster", severity: "error" }),
    ]);
  });

  it("published roster satisfies attendance expectation when publish is required", () => {
    const result = classify({
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        require_publish_before_attendance: true,
        roster_publish_required: true,
        use_default_shift_when_no_roster: false,
      },
    });
    expect(result.expected_start).toBe("2026-09-01T09:00:00+05:00");
    expect(result.rule_conflicts.find((conflict) => conflict.type === "attendance_outside_roster")).toBeUndefined();
  });

  it("draft roster does not satisfy attendance expectation when publish is required", () => {
    const result = classify({
      rosterShift: null,
      unpublishedRosterShift: {
        id: "draft_roster",
        roster_date: "2026-09-01",
        start_time: "09:00",
        end_time: "17:00",
        break_minutes: 60,
        status: "draft",
      },
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        require_publish_before_attendance: true,
        use_default_shift_when_no_roster: false,
      },
    });
    expect(result.expected_start).toBeNull();
    expect(result.rule_conflicts).toEqual([
      expect.objectContaining({
        type: "attendance_outside_roster",
        message: "Attendance was recorded before the roster was published.",
      }),
    ]);
  });

  it("draft roster is allowed when publish is not required", () => {
    const result = classify({
      rosterShift: {
        id: "draft_roster",
        roster_date: "2026-09-01",
        start_time: "09:00",
        end_time: "17:00",
        break_minutes: 60,
        status: "draft",
      },
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        require_publish_before_attendance: false,
        roster_publish_required: false,
        require_roster_for_attendance: true,
        use_default_shift_when_no_roster: false,
      },
    });
    expect(result.expected_start).toBe("2026-09-01T09:00:00+05:00");
    expect(result.rule_conflicts).toEqual([]);
  });

  it("missing published roster message is clear when publish is required", () => {
    const result = classify({
      rosterShift: null,
      attendanceEvents: [],
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        roster_publish_required: true,
        use_default_shift_when_no_roster: false,
      },
    });
    expect(result.rule_conflicts).toContainEqual(
      expect.objectContaining({
        type: "missing_roster",
        message: "No published roster shift is available for this attendance date.",
      }),
    );
  });

  it("roster required plus no attendance without roster creates missing-roster conflict", () => {
    const result = classify({
      rosterShift: null,
      attendanceEvents: [],
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        require_roster_for_attendance: true,
        use_default_shift_when_no_roster: false,
      },
    });
    expect(result.rule_conflicts).toContainEqual(
      expect.objectContaining({ type: "missing_roster", severity: "error" }),
    );
  });

  it("roster required with default shift fallback warns and still calculates expected shift", () => {
    const result = classify({
      rosterShift: null,
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        require_roster_for_attendance: true,
        use_default_shift_when_no_roster: true,
      },
    });
    expect(result.expected_start).toBe("2026-09-01T09:00:00+05:00");
    expect(result.rule_conflicts).toEqual([
      expect.objectContaining({ type: "attendance_outside_roster", severity: "warning" }),
    ]);
  });

  it("existing roster does not create missing roster conflict", () => {
    const result = classify({
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        require_roster_for_attendance: true,
        use_default_shift_when_no_roster: false,
      },
    });
    expect(result.rule_conflicts.find((conflict) => conflict.type === "missing_roster")).toBeUndefined();
    expect(result.rule_conflicts.find((conflict) => conflict.type === "attendance_outside_roster")).toBeUndefined();
  });

  it("handles cross-midnight shifts", () => {
    const result = classify({
      rosterShift: {
        id: "roster_night",
        roster_date: "2026-09-01",
        start_time: "22:00",
        end_time: "06:00",
        break_minutes: 30,
      },
      attendanceEvents: [
        event("clock_in", "2026-09-01T22:00:00+05:00"),
        event("clock_out", "2026-09-02T06:00:00+05:00"),
      ],
    });
    expect(result.expected_end).toBe("2026-09-02T06:00:00+05:00");
    expect(result.classification).toBe("present");
  });

  it("overnight attendance window keeps next-day checkout and excludes unrelated next-day shift", async () => {
    const actualRepository = await vi.importActual<typeof import("../src/modules/attendance/attendance.repository")>(
      "../src/modules/attendance/attendance.repository",
    );
    const rows = [
      event("clock_in", "2026-09-01T22:00:00+05:00"),
      event("clock_out", "2026-09-02T06:00:00+05:00"),
      event("clock_in", "2026-09-02T14:00:00+05:00"),
      event("clock_out", "2026-09-02T22:00:00+05:00"),
    ];

    const filtered = actualRepository.filterEventsForAttendanceWindow(rows, {
      start: "2026-09-01T13:00:00.000Z",
      end: "2026-09-02T05:00:00.000Z",
    });

    expect(filtered.map((row) => row.event_time)).toEqual([
      "2026-09-01T22:00:00+05:00",
      "2026-09-02T06:00:00+05:00",
    ]);
  });

  it("same-day attendance window still keeps same-day punches", async () => {
    const actualRepository = await vi.importActual<typeof import("../src/modules/attendance/attendance.repository")>(
      "../src/modules/attendance/attendance.repository",
    );
    const rows = [
      event("clock_in", "2026-09-01T09:00:00+05:00"),
      event("clock_out", "2026-09-01T17:00:00+05:00"),
      event("clock_in", "2026-09-02T09:00:00+05:00"),
    ];

    const filtered = actualRepository.filterEventsForAttendanceWindow(rows, {
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-09-01T16:00:00.000Z",
    });

    expect(filtered.map((row) => row.event_time)).toEqual([
      "2026-09-01T09:00:00+05:00",
      "2026-09-01T17:00:00+05:00",
    ]);
  });

  it("overnight shift still detects missing checkout", () => {
    const result = classify({
      rosterShift: {
        id: "roster_night",
        roster_date: "2026-09-01",
        start_time: "22:00",
        end_time: "06:00",
        break_minutes: 30,
      },
      attendanceEvents: [event("clock_in", "2026-09-01T22:00:00+05:00")],
    });
    expect(result.classification).toBe("missed_check_out");
    expect(result.summary_status).toBe("missing_clock_out");
  });

  it("calculates overtime when enabled and marks approval warning", () => {
    const result = classify({
      attendanceEvents: [
        event("clock_in", "2026-09-01T09:00:00+05:00"),
        event("clock_out", "2026-09-01T18:20:00+05:00"),
      ],
      settings: {
        ...DEFAULT_ATTENDANCE_RULE_SETTINGS,
        allow_overtime: true,
        overtime_requires_approval: true,
        overtime_rounding_minutes: 15,
        minimum_overtime_minutes: 30,
      },
    });
    expect(result.classification).toBe("overtime");
    expect(result.overtime_minutes).toBe(75);
    expect(result.warnings.join(" ")).toContain("Overtime requires approval");
  });

  it("normalizes backward-compatible attendance setting names", () => {
    const settings = normalizeAttendanceRuleSettings({
      late_grace_minutes: 10,
      early_out_grace_minutes: 15,
      overtime_enabled: true,
      overtime_approval_required: false,
      require_reason_for_manual_attendance: false,
    });
    expect(settings.grace_period_minutes).toBe(10);
    expect(settings.early_checkout_threshold_minutes).toBe(15);
    expect(settings.allow_overtime).toBe(true);
    expect(settings.overtime_requires_approval).toBe(false);
    expect(settings.manual_attendance_requires_reason).toBe(false);
  });
});

describe("attendance summary rule conflict persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMocks.getSetting.mockResolvedValue({
      setting_value_json: JSON.stringify({
        require_roster_for_attendance: true,
        use_default_shift_when_no_roster: false,
      }),
    });
    repositoryMocks.findEmployeeForAttendance.mockResolvedValue({
      id: "emp_1",
      employee_code: "E001",
      full_name: "Employee One",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      joined_at: "2026-01-01",
      resigned_at: null,
      terminated_at: null,
    });
    repositoryMocks.listEventsForAttendanceWindow.mockResolvedValue([
      event("clock_in", "2026-09-01T09:00:00+05:00"),
      event("clock_out", "2026-09-01T17:00:00+05:00"),
    ]);
    repositoryMocks.findDailySummary.mockResolvedValue(null);
    repositoryMocks.findRosterShiftForAttendanceDate.mockResolvedValue(null);
    repositoryMocks.findApprovedLeaveForDate.mockResolvedValue(null);
    repositoryMocks.findAttendanceHolidayForDate.mockResolvedValue(null);
    repositoryMocks.findPayrollRunForMonth.mockResolvedValue(null);
    repositoryMocks.upsertDailySummary.mockResolvedValue({ success: true });
    repositoryMocks.createAttendanceRuleConflict.mockResolvedValue({ success: true });
  });

  it("does not duplicate rule conflicts on repeated summary rebuild", async () => {
    repositoryMocks.findOpenAttendanceRuleConflict
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "att_conflict_existing" });

    await rebuildDailySummary({} as Env, "company_1", "emp_1", "2026-09-01");
    await rebuildDailySummary({} as Env, "company_1", "emp_1", "2026-09-01");

    expect(repositoryMocks.createAttendanceRuleConflict).toHaveBeenCalledTimes(1);
    expect(repositoryMocks.createAttendanceRuleConflict).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conflictType: "attendance_outside_roster",
        attendanceDate: "2026-09-01",
        severity: "error",
      }),
    );
  });
});
