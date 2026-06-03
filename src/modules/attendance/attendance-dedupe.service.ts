import * as repository from "./attendance.repository";
import type { AttendanceEventRecord, AttendanceEventType } from "./attendance.types";
import { ConflictError } from "../../utils/errors";

export const findExistingLocalEvent = (
  env: Env,
  companyId: string,
  deviceId: string | null,
  localId: string | null | undefined,
): Promise<AttendanceEventRecord | null> => {
  if (!deviceId || !localId) return Promise.resolve(null);
  return repository.findEventByLocalId(env, companyId, deviceId, localId);
};

export const assertNoDuplicatePunch = async (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
  eventType: Extract<AttendanceEventType, "clock_in" | "clock_out">,
) => {
  const events = await repository.listEventsForDate(
    env,
    companyId,
    employeeId,
    attendanceDate,
  );
  const existing = events.find((event) => event.event_type === eventType);

  if (existing) {
    throw new ConflictError(
      eventType === "clock_in"
        ? "This employee already has a clock-in record for this date."
        : "This employee already has a clock-out record for this date.",
    );
  }
};

export const hasClockInForDate = async (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
): Promise<boolean> => {
  const events = await repository.listEventsForDate(
    env,
    companyId,
    employeeId,
    attendanceDate,
  );
  return events.some((event) => event.event_type === "clock_in");
};
