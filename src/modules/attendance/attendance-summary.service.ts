import * as repository from "./attendance.repository";
import {
  classifyEmployeeAttendanceDay,
  normalizeAttendanceRuleSettings,
} from "./attendance-classification.service";
import type { AttendanceSummaryStatus } from "./attendance.types";
import * as holidayCalculation from "../holidays/holiday-calculation.service";
import * as holidayService from "../holidays/holidays.service";
import * as settingsService from "../../services/settings.service";
import { createPrefixedId } from "../../utils/ids";

const parseJson = (value: string | null | undefined): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const loadAttendanceRules = async (env: Env, companyId: string) => {
  const [attendanceRow, rosterRow] = await Promise.all([
    settingsService.getSetting(env, companyId, "attendance.default_rules").catch(() => null),
    settingsService.getSetting(env, companyId, "attendance.roster_rules").catch(() => null),
  ]);
  return normalizeAttendanceRuleSettings({
    ...parseJson(attendanceRow?.setting_value_json),
    ...parseJson(rosterRow?.setting_value_json),
  });
};

const MALDIVES_OFFSET = "+05:00";
const BUFFER_MINUTES = 240;

const addMinutesIso = (value: string, minutes: number) =>
  new Date(new Date(value).getTime() + minutes * 60_000).toISOString();

const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

const timeMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const eventWindowForRoster = (date: string, rosterShift: { start_time: string; end_time: string } | null | undefined) => {
  if (!rosterShift) return null;
  const endDate = timeMinutes(rosterShift.end_time) <= timeMinutes(rosterShift.start_time) ? addDays(date, 1) : date;
  const start = `${date}T${rosterShift.start_time}:00${MALDIVES_OFFSET}`;
  const end = `${endDate}T${rosterShift.end_time}:00${MALDIVES_OFFSET}`;
  return {
    start: addMinutesIso(start, -BUFFER_MINUTES),
    end: addMinutesIso(end, BUFFER_MINUTES),
  };
};

const createRuleConflict = async (
  env: Env,
  input: {
    companyId: string;
    employeeId: string;
    outletId: string;
    attendanceDate: string;
    conflictType: string;
    message: string;
    severity: "warning" | "error";
  },
) => {
  const existing = await repository.findOpenAttendanceRuleConflict(env, {
    companyId: input.companyId,
    employeeId: input.employeeId,
    attendanceDate: input.attendanceDate,
    conflictType: input.conflictType,
  }).catch(() => null);
  if (existing) return;

  await repository.createAttendanceRuleConflict(env, {
    id: createPrefixedId("att_conflict"),
    companyId: input.companyId,
    employeeId: input.employeeId,
    outletId: input.outletId,
    conflictType: input.conflictType,
    attendanceDate: input.attendanceDate,
    severity: input.severity,
    message: input.message,
  }).catch(() => undefined);
};

export const rebuildDailySummary = async (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
) => {
  const employee = await repository.findEmployeeForAttendance(env, companyId, employeeId);
  const existingSummary = await repository.findDailySummary(
    env,
    companyId,
    employeeId,
    attendanceDate,
  );

  const settings = await loadAttendanceRules(env, companyId);
  const publishedRosterRequired = settings.require_publish_before_attendance || settings.roster_publish_required;
  const [rosterShift, unpublishedRosterShift] = await Promise.all([
    repository.findRosterShiftForAttendanceDate(env, companyId, employeeId, attendanceDate, publishedRosterRequired).catch(() => null),
    publishedRosterRequired
      ? repository.findRosterShiftForAttendanceDate(env, companyId, employeeId, attendanceDate, false).catch(() => null)
      : Promise.resolve(null),
  ]);
  const eventRosterWindow = eventWindowForRoster(attendanceDate, rosterShift ?? unpublishedRosterShift);
  const events = await repository.listEventsForAttendanceWindow(
    env,
    companyId,
    employeeId,
    attendanceDate,
    eventRosterWindow,
  );
  const outletId = events[0]?.outlet_id ?? existingSummary?.outlet_id ?? employee?.primary_outlet_id ?? "";
  const [approvedLeave, holidaySettings] = await Promise.all([
    repository.findApprovedLeaveForDate(env, companyId, employeeId, attendanceDate).catch(() => null),
    holidayService.getHolidaySettings(env, companyId).catch(() => null),
  ]);
  const holidayContext = holidaySettings && outletId
    ? await holidayCalculation.classifyAttendanceHolidayContext(env, companyId, employeeId, attendanceDate, outletId, holidaySettings).catch(() => null)
    : null;
  const holidayShouldAffectAbsence = Boolean(holidayContext?.is_excused_absence);
  const holidayShouldFlagWork = Boolean(holidayContext?.holiday_work_overtime && events.length > 0);
  const holiday = holidayShouldAffectAbsence || holidayShouldFlagWork
    ? {
        id: holidayContext?.holidays[0]?.id ?? "holiday",
        holiday_name: holidayContext?.holidays.map((event) => event.display_name).join(", ") ?? "Holiday",
        is_paid: holidayContext?.holidays[0]?.paid_holiday ?? 1,
      }
    : null;

  const classification = classifyEmployeeAttendanceDay({
    employeeId,
    date: attendanceDate,
    rosterShift,
    unpublishedRosterShift: publishedRosterRequired ? unpublishedRosterShift : null,
    attendanceEvents: events,
    approvedLeave,
    holiday,
    settings,
    employee: employee
      ? {
          id: employee.id,
          employment_status: employee.employment_status,
          joined_at: (employee as any).joined_at,
          resigned_at: (employee as any).resigned_at,
          terminated_at: (employee as any).terminated_at,
        }
      : null,
  });
  const payrollRun = await repository.findPayrollRunForMonth(
    env,
    companyId,
    attendanceDate.slice(0, 7),
  );
  const payrollStatus = ["finalizing", "finalized", "locked", "paid"].includes(payrollRun?.status ?? "")
    ? "locked"
    : "pending";

  await repository.upsertDailySummary(env, {
    id: createPrefixedId("att_sum"),
    company_id: companyId,
    employee_id: employeeId,
    outlet_id: outletId,
    attendance_date: attendanceDate,
    first_clock_in: classification.actual_check_in,
    last_clock_out: classification.actual_check_out,
    worked_minutes: classification.worked_minutes,
    late_minutes: classification.late_minutes,
    early_out_minutes: classification.early_checkout_minutes,
    break_minutes: classification.break_minutes,
    overtime_minutes: classification.overtime_minutes,
    status: classification.summary_status,
    payroll_status: payrollStatus,
    expected_start: classification.expected_start,
    expected_end: classification.expected_end,
    classification: classification.classification,
    absence_minutes: classification.absence_minutes,
    is_paid_leave: classification.is_paid_leave ? 1 : 0,
    is_unpaid_leave: classification.is_unpaid_leave ? 1 : 0,
    is_holiday: classification.is_holiday ? 1 : 0,
    is_rest_day: classification.is_rest_day ? 1 : 0,
    is_incomplete: classification.is_incomplete ? 1 : 0,
    warnings_json: JSON.stringify(classification.warnings),
    source_references_json: JSON.stringify(classification.source_references),
    calculated_at: new Date().toISOString(),
  });

  for (const conflict of classification.rule_conflicts) {
    if (!outletId) continue;
    await createRuleConflict(env, {
      companyId,
      employeeId,
      outletId,
      attendanceDate,
      conflictType: conflict.type,
      message: conflict.message,
      severity: conflict.severity,
    });
  }

  return {
    attendance_date: attendanceDate,
    status: classification.summary_status as AttendanceSummaryStatus,
    classification: classification.classification,
  };
};
