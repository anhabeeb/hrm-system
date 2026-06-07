import * as repository from "./attendance.repository";
import type { AttendanceSummaryStatus } from "./attendance.types";
import { createPrefixedId } from "../../utils/ids";

const minutesBetween = (start: string, end: string): number =>
  Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));

export const rebuildDailySummary = async (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
) => {
  const events = await repository.listEventsForDate(
    env,
    companyId,
    employeeId,
    attendanceDate,
  );
  const existingSummary = await repository.findDailySummary(
    env,
    companyId,
    employeeId,
    attendanceDate,
  );

  if (events.length === 0 && existingSummary) {
    return {
      attendance_date: attendanceDate,
      status: existingSummary.status,
    };
  }
  const firstClockIn = events.find((event) => event.event_type === "clock_in") ?? null;
  const lastClockOut =
    [...events].reverse().find((event) => event.event_type === "clock_out") ?? null;
  const firstEvent = events[0];
  let status: AttendanceSummaryStatus = "absent";

  if (firstClockIn && lastClockOut) status = "present";
  else if (firstClockIn && !lastClockOut) status = "checked_in";
  else if (!firstClockIn && lastClockOut) status = "missing_clock_in";

  const workedMinutes =
    firstClockIn && lastClockOut
      ? minutesBetween(firstClockIn.event_time, lastClockOut.event_time)
      : 0;
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
    outlet_id: firstEvent?.outlet_id ?? existingSummary?.outlet_id ?? "",
    attendance_date: attendanceDate,
    first_clock_in: firstClockIn?.event_time ?? null,
    last_clock_out: lastClockOut?.event_time ?? null,
    worked_minutes: workedMinutes,
    late_minutes: 0,
    early_out_minutes: 0,
    break_minutes: 0,
    overtime_minutes: 0,
    status,
    payroll_status: payrollStatus,
  });

  return {
    attendance_date: attendanceDate,
    status,
  };
};
