import { findEventByLocalId } from "../attendance/attendance.repository";

export const findExistingOfflineAttendanceEvent = (
  env: Env,
  companyId: string,
  deviceId: string,
  localId: string,
) => findEventByLocalId(env, companyId, deviceId, localId);
