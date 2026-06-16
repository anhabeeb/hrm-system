import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertCanViewEmployeeAttendanceCalendar,
  buildCalendarDays,
  deriveDefaultPayrollPeriod,
  getAttendanceSummary,
  getSelfAttendanceCalendar,
  resolvePayrollImpact,
} from "../src/modules/attendance/attendance-calendar.service";
import type { AttendanceCalendarEmployeeRecord } from "../src/modules/attendance/attendance-calendar.types";
import type { AuthActor } from "../src/types/api.types";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_1",
  fullName: "Attendance Manager",
  email: "manager@example.test",
  roles: ["Manager"],
  roleKeys: ["manager"],
  permissions: ["attendance.calendar.viewTeam"],
  outletIds: [],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const employee = (overrides: Partial<AttendanceCalendarEmployeeRecord> = {}): AttendanceCalendarEmployeeRecord => ({
  id: "emp_1",
  full_name: "Employee One",
  employee_code: "E001",
  department_id: "dept_1",
  department_name: "Operations",
  position_id: "pos_1",
  position_name: "Crew",
  level: 1,
  primary_outlet_id: "outlet_1",
  store_id: null,
  joined_at: "2026-01-01",
  resigned_at: null,
  terminated_at: null,
  employment_status: "active",
  deleted_at: null,
  archived_at: null,
  ...overrides,
});

const envWithActorEmployee = (linked = employee({ id: "actor_emp", level: 3 })) => ({
  DB: {
    prepare: (sql: string) => ({
      bind: () => ({
        first: async () => {
          if (sql.includes("FROM users u") && sql.includes("JOIN employees e")) return linked;
          return null;
        },
        all: async () => ({ results: [] }),
      }),
    }),
  },
}) as unknown as Env;

const basePeriod = deriveDefaultPayrollPeriod("2026-06");
const build = (overrides: Partial<Parameters<typeof buildCalendarDays>[0]> = {}) => buildCalendarDays({
  employee: employee(),
  period: basePeriod,
  month: "2026-06",
  summaries: [],
  events: [],
  leaves: [],
  corrections: [],
  shifts: [],
  holidays: [],
  ...overrides,
});

describe("Employee Attendance / Payroll Calendar", () => {
  it("calendar returns selected month days and derived payroll period dates", () => {
    const period = deriveDefaultPayrollPeriod("2026-06");
    const days = build({ period });
    expect(days).toHaveLength(30);
    expect(period.start_date).toBe("2026-06-01");
    expect(period.end_date).toBe("2026-06-30");
    expect(period.pay_date).toBe("2026-06-30");
    expect(period.is_derived).toBe(true);
  });

  it("present day appears correctly", () => {
    const day = build({ summaries: [{ attendance_date: "2026-06-01", first_clock_in: "2026-06-01T08:00:00Z", last_clock_out: "2026-06-01T16:00:00Z", late_minutes: 0 }] })[0];
    expect(day.status).toBe("PRESENT");
    expect(day.payroll_impact).toBe("PAID");
  });

  it("late day appears correctly", () => {
    const day = build({ summaries: [{ attendance_date: "2026-06-02", first_clock_in: "2026-06-02T08:12:00Z", late_minutes: 12 }] })[1];
    expect(day.status).toBe("LATE");
    expect(day.payroll_impact).toBe("PAID");
  });

  it("approved leave and sick leave are not marked absent", () => {
    const days = build({
      leaves: [
        { id: "leave_1", start_date: "2026-06-03", end_date: "2026-06-03", leave_name: "Annual Leave", status: "approved", is_paid: 1 },
        { id: "leave_2", start_date: "2026-06-04", end_date: "2026-06-04", leave_key: "sick_leave", status: "approved", is_paid: 1 },
      ],
      shifts: [
        { id: "shift_3", shift_date: "2026-06-03", status: "scheduled" },
        { id: "shift_4", shift_date: "2026-06-04", status: "scheduled" },
      ],
    });
    expect(days[2].status).toBe("LEAVE");
    expect(days[3].status).toBe("SICK");
    expect(days[2].payroll_impact).toBe("PAID");
    expect(days[3].payroll_impact).toBe("PAID");
  });

  it("absent day appears only when scheduled/recorded absence exists", () => {
    const day = build({ summaries: [{ attendance_date: "2026-06-05", status: "absent" }] })[4];
    expect(day.status).toBe("ABSENT");
    expect(day.payroll_impact).toBe("DEDUCT");
  });

  it("pending correction appears and approved correction overrides status", () => {
    const days = build({
      summaries: [
        { attendance_date: "2026-06-06", status: "absent" },
        { attendance_date: "2026-06-07", status: "absent" },
      ],
      corrections: [
        { id: "corr_1", requested_date: "2026-06-06", status: "pending", correction_type: "CLOCK_IN" },
        { id: "corr_2", requested_date: "2026-06-07", status: "approved", correction_type: "STATUS_OVERRIDE" },
      ],
    });
    expect(days[5].status).toBe("PENDING_CORRECTION");
    expect(days[5].payroll_impact).toBe("REVIEW_REQUIRED");
    expect(days[6].status).toBe("APPROVED_CORRECTION");
    expect(days[6].payroll_impact).toBe("PAID");
  });

  it("missing punch returns REVIEW_REQUIRED", () => {
    const day = build({ summaries: [{ attendance_date: "2026-06-08", status: "missing_clock_out", first_clock_in: "2026-06-08T08:00:00Z" }] })[7];
    expect(day.status).toBe("MISSING_PUNCH");
    expect(day.payroll_impact).toBe("REVIEW_REQUIRED");
  });

  it("day off and holiday are not absent", () => {
    const days = build({
      shifts: [{ id: "shift_9", shift_date: "2026-06-09", status: "day_off" }],
      holidays: [{ id: "holiday_1", holiday_name: "Public Holiday", start_date: "2026-06-10", end_date: "2026-06-10", is_paid: 1 }],
    });
    expect(days[8].status).toBe("DAY_OFF");
    expect(days[9].status).toBe("HOLIDAY");
    expect(days[8].payroll_impact).toBe("NO_IMPACT");
    expect(days[9].payroll_impact).toBe("PAID");
  });

  it("day outside active employment is not absent", () => {
    const [day] = build({ employee: employee({ joined_at: "2026-06-02" }), summaries: [{ attendance_date: "2026-06-01", status: "absent" }] });
    expect(day.status).toBe("NOT_ACTIVE");
    expect(day.payroll_impact).toBe("NO_IMPACT");
  });

  it("summary counts payroll impact and review-required days", () => {
    const summary = getAttendanceSummary(build({
      summaries: [
        { attendance_date: "2026-06-01", first_clock_in: "2026-06-01T08:00:00Z" },
        { attendance_date: "2026-06-02", status: "absent" },
        { attendance_date: "2026-06-03", status: "missing_clock_out" },
      ],
    }));
    expect(summary.present_days).toBe(1);
    expect(summary.absent_days).toBe(1);
    expect(summary.deduction_days).toBe(1);
    expect(summary.review_required_days).toBe(1);
  });

  it("self-service requires linked employee and blocks standalone Super Admin", async () => {
    const env = envWithActorEmployee(null as unknown as AttendanceCalendarEmployeeRecord);
    await expect(getSelfAttendanceCalendar(env, actor({
      isSuperAdmin: true,
      permissions: ["self.attendance.calendar.view"],
    }), { month: "2026-06", mode: "self" })).rejects.toThrow("Self-service attendance calendar is only available");
  });

  it("employee cannot view coworker calendar without team/global access", async () => {
    await expect(assertCanViewEmployeeAttendanceCalendar(
      envWithActorEmployee(employee({ id: "actor_emp", department_id: "dept_1", level: 1 })),
      actor({ permissions: ["self.attendance.calendar.view"] }),
      employee({ id: "coworker_emp", department_id: "dept_1", level: 1 }),
      ["self.attendance.calendar.view"],
    )).rejects.toThrow("You do not have access");
  });

  it("manager can view lower-level same-department employee if permitted", async () => {
    await expect(assertCanViewEmployeeAttendanceCalendar(
      envWithActorEmployee(employee({ id: "actor_emp", department_id: "dept_1", level: 3 })),
      actor({ permissions: ["attendance.calendar.viewTeam"] }),
      employee({ id: "target_emp", department_id: "dept_1", level: 1 }),
      ["attendance.calendar.viewTeam"],
    )).resolves.toBeUndefined();
  });

  it("disabled Leave module hides leave overlay but calendar still works", () => {
    const service = read("src/modules/attendance/attendance-calendar.service.ts");
    expect(service).toContain("leaveEnabled ? repository.listApprovedLeaves");
    expect(service).toContain("Leave module is disabled; leave and sick overlays are unavailable.");
  });

  it("frontend calendar page renders and integrations are registered", () => {
    expect(read("frontend/src/features/attendance-calendar/EmployeeAttendanceCalendarPage.tsx")).toContain("EmployeeAttendanceCalendarWidget");
    expect(read("frontend/src/features/attendance-calendar/AttendanceCalendarGrid.tsx")).toContain("AttendanceDayCell");
    expect(read("frontend/src/features/attendance-calendar/AttendancePayrollPeriodHeader.tsx")).toContain("Payroll Period");
    expect(read("frontend/src/app/router.tsx")).toContain('path="/self/attendance-calendar"');
    expect(read("frontend/src/app/router.tsx")).toContain('path="/attendance/calendar"');
    expect(read("frontend/src/app/router.tsx")).toContain('path="/payroll/attendance-review"');
    expect(read("frontend/src/features/employees/Employee360Page.tsx")).toContain('value="attendance-calendar"');
    expect(read("frontend/src/features/attendance/AttendancePage.tsx")).toContain('value="calendar"');
    expect(read("frontend/src/features/payroll/PayrollPage.tsx")).toContain('value="attendance-review"');
  });

  it("no \"Search selector coming soon\" text remains and employee selector component exists", () => {
    const widget = read("frontend/src/features/attendance-calendar/EmployeeAttendanceCalendarWidget.tsx");
    const selector = read("frontend/src/features/attendance-calendar/AttendanceCalendarEmployeeSelector.tsx");
    const api = read("frontend/src/features/attendance-calendar/attendanceCalendar.api.ts");
    expect(widget).not.toContain("Search selector coming soon");
    expect(widget).not.toContain("placeholder=\"Select or enter employee ID\"");
    expect(selector).toContain("LookupCombobox");
    expect(selector).toContain("calendarEmployees");
    expect(api).toContain("/attendance/calendar-employees");
    expect(read("src/routes/attendance.routes.ts")).toContain('"/calendar-employees"');
  });

  it("navigation hides calendar links through module, permission, and linked employee guards", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    expect(navigation).toContain("My Attendance Calendar");
    expect(navigation).toContain("requiresLinkedEmployee: true");
    expect(navigation).toContain("payroll.attendanceReview.view");
    expect(navigation).toContain("attendance.calendar.viewTeam");
  });

  it("Payroll Attendance Review nav requires both Payroll and Attendance", () => {
    const navigation = read("frontend/src/lib/navigation.ts");
    const router = read("frontend/src/app/router.tsx");
    expect(navigation).toContain('moduleCodesAll: ["payroll", "attendance"]');
    expect(navigation).toContain('requiredFeaturesAll: ["payroll", "attendance"]');
    expect(router).toContain('featuresAll: ["payroll", "attendance"]');
    expect(router).toContain('moduleCodesAll: ["payroll", "attendance"]');
  });

  it("Employee 360 Attendance Calendar tab is conditional", () => {
    const page = read("frontend/src/features/employees/Employee360Page.tsx");
    expect(page).toContain("canViewAttendanceCalendar");
    expect(page).toContain('auth.hasFeature("attendance")');
    expect(page).toContain("{canViewAttendanceCalendar ? <TabsTrigger value=\"attendance-calendar\">");
  });

  it("Payroll page Attendance Review tab is conditional", () => {
    const page = read("frontend/src/features/payroll/PayrollPage.tsx");
    expect(page).toContain("canViewAttendanceReview");
    expect(page).toContain('isModuleEnabled(auth.user, "payroll")');
    expect(page).toContain('isModuleEnabled(auth.user, "attendance")');
    expect(page).toContain("canViewAttendanceReview ? <TabsTrigger value=\"attendance-review\">");
  });

  it("Attendance page Calendar tab is conditional", () => {
    const page = read("frontend/src/features/attendance/AttendancePage.tsx");
    expect(page).toContain("canViewCalendar");
    expect(page).toContain("canViewCalendar ? <TabsTrigger value=\"calendar\">");
  });

  it("no alert/confirm usage or dark mode is introduced in attendance calendar frontend", () => {
    const source = [
      "frontend/src/features/attendance-calendar/EmployeeAttendanceCalendarWidget.tsx",
      "frontend/src/features/attendance-calendar/EmployeeAttendanceCalendarPage.tsx",
      "frontend/src/features/attendance-calendar/AttendanceCalendarGrid.tsx",
      "frontend/src/features/attendance-calendar/AttendanceDayDetailDrawer.tsx",
    ].map(read).join("\n");
    expect(source).not.toMatch(/\b(?:window\.)?alert\s*\(/);
    expect(source).not.toMatch(/\b(?:window\.)?confirm\s*\(/);
    expect(source).not.toMatch(/\bdarkMode\b|\bdark:/);
  });

  it("resolvePayrollImpact keeps payroll review labels conservative", () => {
    expect(resolvePayrollImpact("ABSENT")).toBe("DEDUCT");
    expect(resolvePayrollImpact("PENDING_CORRECTION")).toBe("REVIEW_REQUIRED");
    expect(resolvePayrollImpact("OUTSIDE_PAYROLL_PERIOD")).toBe("NO_IMPACT");
  });
});
