import {
  ACCOUNT_LOCK_MINUTES,
  BACKUP_CODE_COUNT,
  FAILED_LOGIN_LIMIT,
  LOCKED_ACCOUNT_MESSAGE,
  LOGIN_ERROR_MESSAGE,
  PASSWORD_HASH_ALGORITHM,
  PASSWORD_RESET_TTL_MINUTES,
  TOTP_DIGITS,
  TOTP_ISSUER,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW,
} from "./auth.constants";
import * as authRepository from "./auth.repository";
import type {
  AuthenticatedRequestContext,
  BackupCodeRecord,
  BackupCodeInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  KycUpdateRequestInput,
  LoginInput,
  ResetPasswordInput,
  SafeUserProfile,
  TwoFactorDisableInput,
  TwoFactorRecord,
  TwoFactorVerifyInput,
  UserRecord,
} from "./auth.types";
import { createAuditLog } from "../../services/audit.service";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../../services/password.service";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
} from "../../services/session.service";
import { AuthError, LockedRecordError, NotFoundError, ValidationError } from "../../utils/errors";
import { createEntityId } from "../../utils/ids";
import {
  base64ToBytes,
  bytesToBase64,
  constantTimeEqual,
  decodeUtf8,
  encodeUtf8,
  generateSecureToken,
  hashToken,
  randomBytes,
} from "../../utils/crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const nowIso = (): string => new Date().toISOString();

const toSafeUser = (user: UserRecord): SafeUserProfile => ({
  id: user.id,
  company_id: user.company_id,
  employee_id: user.employee_id,
  full_name: user.full_name,
  email: user.email,
  phone: user.phone,
  status: user.status,
  two_factor_enabled: user.two_factor_enabled === 1,
  password_reset_required: user.password_reset_required === 1,
  last_login_at: user.last_login_at,
  password_updated_at: user.password_updated_at,
});

const isActiveUser = (user: UserRecord): boolean =>
  user.status === "active" && !user.deleted_at;

const audit = async (
  env: Env,
  input: {
    action: string;
    user?: UserRecord | null;
    request: AuthenticatedRequestContext;
    entityType?: string;
    entityId?: string;
    reason?: string;
  },
) => {
  await createAuditLog(env, {
    companyId: input.user?.company_id,
    action: input.action,
    module: "auth",
    entityType: input.entityType ?? "user",
    entityId: input.entityId ?? input.user?.id,
    actorId: input.user?.id,
    ipAddress: input.request.ipAddress,
    userAgent: input.request.userAgent,
    reason: input.reason,
    requestId: input.request.requestId,
  }).catch(() => undefined);
};

const addMinutes = (minutes: number): string =>
  new Date(Date.now() + minutes * 60 * 1000).toISOString();

const encodeBase32 = (bytes: Uint8Array): string => {
  let bits = "";
  let output = "";

  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }

  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += base32Alphabet[parseInt(chunk, 2)];
  }

  return output;
};

const decodeBase32 = (value: string): Uint8Array => {
  const cleaned = value.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";

  for (const character of cleaned) {
    const index = base32Alphabet.indexOf(character);

    if (index === -1) {
      throw new ValidationError("The Google Authenticator setup key is not valid.");
    }

    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];

  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }

  return new Uint8Array(bytes);
};

const deriveTotpEncryptionKey = async (secret: string): Promise<CryptoKey> => {
  const digest = await crypto.subtle.digest("SHA-256", encodeUtf8(secret));

  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
};

const encryptTotpSecret = async (secret: string, encryptionSecret: string): Promise<string> => {
  const key = await deriveTotpEncryptionKey(encryptionSecret);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encodeUtf8(secret),
  );

  return `v1$${bytesToBase64(iv)}$${bytesToBase64(new Uint8Array(ciphertext))}`;
};

const decryptTotpSecret = async (
  encryptedSecret: string,
  encryptionSecret: string,
): Promise<string> => {
  const [version, ivValue, ciphertextValue] = encryptedSecret.split("$");

  if (version !== "v1" || !ivValue || !ciphertextValue) {
    throw new AuthError("Two-factor authentication is not set up correctly.");
  }

  const key = await deriveTotpEncryptionKey(encryptionSecret);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(ivValue),
    },
    key,
    base64ToBytes(ciphertextValue),
  );

  return decodeUtf8(new Uint8Array(plaintext));
};

const hotp = async (secret: Uint8Array, counter: number): Promise<string> => {
  const counterBytes = new ArrayBuffer(8);
  const view = new DataView(counterBytes);
  view.setUint32(4, counter);

  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    {
      name: "HMAC",
      hash: "SHA-1",
    },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
};

const verifyTotpCode = async (secret: string, code: string): Promise<boolean> => {
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
  const secretBytes = decodeBase32(secret);

  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const expectedCode = await hotp(secretBytes, counter + offset);

    if (constantTimeEqual(expectedCode, code)) {
      return true;
    }
  }

  return false;
};

const createBackupCodes = async (
  pepper: string,
): Promise<{ codes: string[]; records: BackupCodeRecord[] }> => {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
    generateSecureToken(9).slice(0, 12).toUpperCase(),
  );
  const records = await Promise.all(
    codes.map(async (code) => ({
      hash: await hashToken(code, pepper),
      used_at: null,
    })),
  );

  return { codes, records };
};

const parseBackupCodes = (twoFactor: TwoFactorRecord): BackupCodeRecord[] => {
  if (!twoFactor.backup_codes_hash_json) {
    return [];
  }

  try {
    return JSON.parse(twoFactor.backup_codes_hash_json) as BackupCodeRecord[];
  } catch {
    return [];
  }
};

const consumeBackupCode = async (
  env: Env,
  twoFactor: TwoFactorRecord,
  code: string,
): Promise<boolean> => {
  const backupCodes = parseBackupCodes(twoFactor);
  const codeHash = await hashToken(code.trim().toUpperCase(), env.PASSWORD_PEPPER);
  const match = backupCodes.find(
    (backupCode) => !backupCode.used_at && constantTimeEqual(backupCode.hash, codeHash),
  );

  if (!match) {
    return false;
  }

  match.used_at = nowIso();
  await authRepository.updateTwoFactorBackupCodes(
    env,
    twoFactor.id,
    JSON.stringify(backupCodes),
  );

  return true;
};

const ensureAuthenticated = async (
  env: Env,
  userId: string,
): Promise<UserRecord> => {
  const user = await authRepository.findUserById(env, userId);

  if (!user || !isActiveUser(user)) {
    throw new AuthError("Please sign in to continue.");
  }

  return user;
};

export const login = async (
  env: Env,
  input: LoginInput,
  request: AuthenticatedRequestContext,
) => {
  const email = normalizeEmail(input.email);
  const user = await authRepository.findUserByEmail(env, email);

  if (!user || !isActiveUser(user)) {
    await audit(env, { action: "login_failed", user, request });
    throw new AuthError(LOGIN_ERROR_MESSAGE);
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    await audit(env, { action: "login_failed", user, request });
    throw new LockedRecordError(LOCKED_ACCOUNT_MESSAGE);
  }

  const passwordValid = await verifyPassword(
    input.password,
    user.password_hash,
    env.PASSWORD_PEPPER,
  );

  if (!passwordValid) {
    const failedAttempts = user.failed_login_attempts + 1;
    const lockedUntil =
      failedAttempts >= FAILED_LOGIN_LIMIT ? addMinutes(ACCOUNT_LOCK_MINUTES) : null;

    await authRepository.updateFailedLogin(env, user.id, failedAttempts, lockedUntil);
    await audit(env, {
      action: lockedUntil ? "account_locked" : "login_failed",
      user,
      request,
    });
    throw new AuthError(LOGIN_ERROR_MESSAGE);
  }

  if (passwordNeedsRehash(user.password_hash, env)) {
    try {
      const upgradedPasswordHash = await hashPassword(input.password, env.PASSWORD_PEPPER, env);
      await authRepository.updatePassword(
        env,
        user.id,
        upgradedPasswordHash,
        PASSWORD_HASH_ALGORITHM,
      );
    } catch (error) {
      console.warn("Password hash upgrade failed after successful login", {
        userId: user.id,
        error,
      });
    }
  }

  if (user.two_factor_enabled === 1) {
    const twoFactor = await authRepository.getTwoFactorByUserId(env, user.id);

    if (!twoFactor?.secret_encrypted || twoFactor.disabled_at) {
      throw new AuthError("Two-factor authentication is not available for this account.");
    }

    if (!input.totp_code && !input.backup_code) {
      return {
        response: {
          two_factor_required: true,
          method: "totp",
        },
        message: "Please enter your Google Authenticator code.",
      };
    }

    const totpValid = input.totp_code
      ? await verifyTotpCode(
          await decryptTotpSecret(twoFactor.secret_encrypted, env.TOTP_ENCRYPTION_KEY),
          input.totp_code,
        )
      : false;
    const backupValid =
      !totpValid && input.backup_code
        ? await consumeBackupCode(env, twoFactor, input.backup_code)
        : false;

    if (!totpValid && !backupValid) {
      await audit(env, { action: "two_factor_failed", user, request });
      throw new AuthError("The Google Authenticator code is incorrect.");
    }

    if (backupValid) {
      await audit(env, { action: "backup_code_used", user, request });
    }
  }

  await authRepository.resetFailedLogin(env, user.id);
  const sessionToken = await createSessionToken(env.SESSION_SECRET);

  await authRepository.createSession(env, {
    id: sessionToken.id,
    companyId: user.company_id,
    userId: user.id,
    tokenHash: sessionToken.tokenHash,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    deviceId: request.deviceId,
    expiresAt: sessionToken.expiresAt,
  });
  await audit(env, { action: "login_success", user, request });

  return {
    response: {
      user: toSafeUser({
        ...user,
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: nowIso(),
      }),
    },
    cookie: buildSessionCookie(sessionToken.token, sessionToken.expiresAt),
    message: "You are now logged in.",
  };
};

export const logout = async (
  env: Env,
  user: UserRecord,
  sessionId: string,
  request: AuthenticatedRequestContext,
) => {
  await authRepository.revokeSession(env, sessionId);
  await audit(env, { action: "logout", user, request });

  return {
    response: {},
    cookie: buildClearSessionCookie(),
    message: "You have been logged out.",
  };
};

export const getMe = async (env: Env, userId: string) => {
  const user = await ensureAuthenticated(env, userId);
  const [roles, permissions, outletIds, features] = await Promise.all([
    authRepository.getUserRoles(env, user.id),
    authRepository.getUserPermissions(env, user.id),
    authRepository.getUserOutletIds(env, user.id),
    authRepository.getEnabledFeatureKeys(env, user.company_id),
  ]);

  return {
    user: toSafeUser(user),
    roles,
    permissions,
    outlet_ids: outletIds,
    features,
  };
};

export const getSecuritySummary = async (env: Env, userId: string) => {
  const user = await ensureAuthenticated(env, userId);
  const activeSessionsCount = await authRepository.countActiveSessions(env, user.id);

  return {
    password_updated_at: user.password_updated_at,
    two_factor_enabled: user.two_factor_enabled === 1,
    active_sessions_count: activeSessionsCount,
    last_login_at: user.last_login_at,
  };
};

export const forgotPassword = async (
  env: Env,
  input: ForgotPasswordInput,
  request: AuthenticatedRequestContext,
) => {
  const user = await authRepository.findUserByEmail(env, normalizeEmail(input.email));
  let resetUrl: string | undefined;

  if (user && isActiveUser(user)) {
    const token = generateSecureToken(40);
    const tokenHash = await hashToken(token, env.SESSION_SECRET);

    await authRepository.createPasswordResetToken(env, {
      id: createEntityId("user").replace("user_", "reset_"),
      companyId: user.company_id,
      userId: user.id,
      tokenHash,
      expiresAt: addMinutes(PASSWORD_RESET_TTL_MINUTES),
    });
    await audit(env, {
      action: "password_reset_requested",
      user,
      request,
      entityType: "password_reset_token",
    });

    if (env.ENVIRONMENT === "local") {
      resetUrl = `/reset-password?token=${token}`;
    }
  }

  return {
    message: "If the account exists, password reset instructions will be sent.",
    response: resetUrl ? { reset_url: resetUrl } : {},
  };
};

export const resetPassword = async (
  env: Env,
  input: ResetPasswordInput,
  request: AuthenticatedRequestContext,
) => {
  const tokenHash = await hashToken(input.token, env.SESSION_SECRET);
  const resetToken = await authRepository.findPasswordResetToken(env, tokenHash);

  if (
    !resetToken ||
    resetToken.used_at ||
    new Date(resetToken.expires_at).getTime() <= Date.now()
  ) {
    throw new AuthError("This password reset link is invalid or has expired.");
  }

  const user = await ensureAuthenticated(env, resetToken.user_id);
  const passwordHash = await hashPassword(input.new_password, env.PASSWORD_PEPPER, env);

  await authRepository.updatePassword(
    env,
    user.id,
    passwordHash,
    PASSWORD_HASH_ALGORITHM,
  );
  await authRepository.markPasswordResetTokenUsed(env, resetToken.id);
  await authRepository.revokeUserSessions(env, user.id);
  await audit(env, { action: "password_reset_completed", user, request });

  return {
    response: {},
    message: "Your password has been reset. Please log in again.",
  };
};

export const changePassword = async (
  env: Env,
  userId: string,
  sessionId: string | undefined,
  input: ChangePasswordInput,
  request: AuthenticatedRequestContext,
) => {
  const user = await ensureAuthenticated(env, userId);
  const currentPasswordValid = await verifyPassword(
    input.current_password,
    user.password_hash,
    env.PASSWORD_PEPPER,
  );

  if (!currentPasswordValid) {
    throw new AuthError("The current password is incorrect.");
  }

  const passwordHash = await hashPassword(input.new_password, env.PASSWORD_PEPPER, env);

  await authRepository.updatePassword(
    env,
    user.id,
    passwordHash,
    PASSWORD_HASH_ALGORITHM,
  );
  await authRepository.revokeUserSessions(env, user.id, sessionId);
  await audit(env, { action: "password_changed", user, request });

  return {
    response: {},
    message: "Your password has been changed.",
  };
};

export const setupTwoFactor = async (
  env: Env,
  userId: string,
  request: AuthenticatedRequestContext,
) => {
  const user = await ensureAuthenticated(env, userId);
  const secret = encodeBase32(randomBytes(20));
  const encryptedSecret = await encryptTotpSecret(secret, env.TOTP_ENCRYPTION_KEY);
  const existing = await authRepository.getTwoFactorByUserId(env, user.id);
  const id = existing?.id ?? createEntityId("user").replace("user_", "2fa_");

  await authRepository.createOrUpdateTwoFactor(env, {
    id,
    companyId: user.company_id,
    userId: user.id,
    secretEncrypted: encryptedSecret,
    backupCodesHashJson: null,
    enabledAt: null,
  });
  await audit(env, { action: "two_factor_setup_started", user, request });

  const label = encodeURIComponent(user.email ?? user.full_name);
  const issuer = encodeURIComponent(TOTP_ISSUER);

  return {
    response: {
      otpauth_url: `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&period=${TOTP_PERIOD_SECONDS}&digits=${TOTP_DIGITS}`,
      manual_setup_key: secret,
    },
    message:
      "Scan this code with Google Authenticator, then enter the 6-digit code to finish setup.",
  };
};

export const verifyTwoFactor = async (
  env: Env,
  userId: string,
  input: TwoFactorVerifyInput,
  request: AuthenticatedRequestContext,
) => {
  const user = await ensureAuthenticated(env, userId);
  const twoFactor = await authRepository.getTwoFactorByUserId(env, user.id);

  if (!twoFactor?.secret_encrypted) {
    throw new AuthError("Two-factor authentication setup has not been started.");
  }

  const secret = await decryptTotpSecret(
    twoFactor.secret_encrypted,
    env.TOTP_ENCRYPTION_KEY,
  );
  const isValid = await verifyTotpCode(secret, input.code);

  if (!isValid) {
    await audit(env, { action: "two_factor_failed", user, request });
    throw new AuthError("The Google Authenticator code is incorrect.");
  }

  let backupCodes: string[] | undefined;

  if (!twoFactor.enabled_at || user.two_factor_enabled !== 1) {
    const backupCodeSet = await createBackupCodes(env.PASSWORD_PEPPER);
    backupCodes = backupCodeSet.codes;

    await authRepository.createOrUpdateTwoFactor(env, {
      id: twoFactor.id,
      companyId: user.company_id,
      userId: user.id,
      secretEncrypted: twoFactor.secret_encrypted,
      backupCodesHashJson: JSON.stringify(backupCodeSet.records),
      enabledAt: nowIso(),
    });
    await authRepository.setUserTwoFactorEnabled(env, user.id, true);
    await audit(env, { action: "two_factor_enabled", user, request });
  }

  return {
    response: backupCodes ? { backup_codes: backupCodes } : {},
    message: "Two-factor authentication is enabled.",
  };
};

export const disableTwoFactor = async (
  env: Env,
  userId: string,
  input: TwoFactorDisableInput,
  request: AuthenticatedRequestContext,
) => {
  const user = await ensureAuthenticated(env, userId);
  const twoFactor = await authRepository.getTwoFactorByUserId(env, user.id);
  let confirmed = false;

  if (input.password) {
    confirmed = await verifyPassword(input.password, user.password_hash, env.PASSWORD_PEPPER);
  }

  if (!confirmed && input.code && twoFactor?.secret_encrypted) {
    confirmed = await verifyTotpCode(
      await decryptTotpSecret(twoFactor.secret_encrypted, env.TOTP_ENCRYPTION_KEY),
      input.code,
    );
  }

  if (!confirmed) {
    throw new AuthError("We could not confirm your identity. Please try again.");
  }

  await authRepository.disableTwoFactor(env, user.id);
  await authRepository.setUserTwoFactorEnabled(env, user.id, false);
  await audit(env, { action: "two_factor_disabled", user, request });

  return {
    response: {},
    message: "Two-factor authentication has been disabled.",
  };
};

export const useBackupCode = async (
  env: Env,
  userId: string,
  input: BackupCodeInput,
  request: AuthenticatedRequestContext,
) => {
  const user = await ensureAuthenticated(env, userId);
  const twoFactor = await authRepository.getTwoFactorByUserId(env, user.id);

  if (!twoFactor) {
    throw new AuthError("Two-factor authentication is not enabled.");
  }

  const valid = await consumeBackupCode(env, twoFactor, input.backup_code);

  if (!valid) {
    throw new AuthError("The backup code is incorrect or has already been used.");
  }

  await audit(env, { action: "backup_code_used", user, request });

  return {
    response: {},
    message: "Backup code accepted.",
  };
};

export const createKycRequest = async (
  env: Env,
  userId: string,
  input: KycUpdateRequestInput,
  request: AuthenticatedRequestContext,
) => {
  const user = await ensureAuthenticated(env, userId);
  const requestId = createEntityId("user").replace("user_", "kyc_");

  await authRepository.createKycRequest(env, {
    id: requestId,
    companyId: user.company_id,
    userId: user.id,
    employeeId: user.employee_id,
    requestType: input.request_type,
    requestedValueJson: JSON.stringify(input.requested_value_json),
    reason: input.reason ?? null,
  });
  await audit(env, {
    action: "kyc_update_requested",
    user,
    request,
    entityType: "user_profile_update_request",
    entityId: requestId,
  });

  return {
    response: {
      id: requestId,
      status: "pending",
    },
    message: "Your update request has been submitted for review.",
  };
};

export const listOwnKycRequests = async (env: Env, userId: string) => {
  await ensureAuthenticated(env, userId);
  return authRepository.listOwnKycRequests(env, userId);
};

export const getOwnKycRequest = async (
  env: Env,
  userId: string,
  requestId: string,
) => {
  await ensureAuthenticated(env, userId);
  const request = await authRepository.findOwnKycRequest(env, userId, requestId);

  if (!request) {
    throw new NotFoundError("The requested update request could not be found.");
  }

  return request;
};

export const loadUserRecord = (env: Env, userId: string) =>
  ensureAuthenticated(env, userId);
