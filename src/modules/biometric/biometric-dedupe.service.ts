import * as repository from "./biometric.repository";

export const createBiometricDedupeKey = (
  companyId: string,
  deviceId: string,
  input: {
    biometric_user_id: string;
    event_time: string;
    event_type: string;
    device_event_id?: string;
  },
) =>
  input.device_event_id
    ? `${companyId}:${deviceId}:event:${input.device_event_id}`
    : `${companyId}:${deviceId}:${input.biometric_user_id}:${input.event_time}:${input.event_type}`;

export const findDuplicateBiometricLog = (
  env: Env,
  companyId: string,
  dedupeKey: string,
) => repository.findLogByDedupeKey(env, companyId, dedupeKey);
