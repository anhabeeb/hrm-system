import * as repository from "./biometric.repository";

export const findActiveBiometricMapping = (
  env: Env,
  companyId: string,
  deviceId: string,
  biometricUserId: string,
) => repository.findMapping(env, companyId, deviceId, biometricUserId);
