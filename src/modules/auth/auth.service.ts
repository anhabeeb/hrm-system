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
  SafeSessionRecord,
  SafeUserProfile,
  SessionRecord,
  TwoFactorDisableInput,
  TwoFactorChallengeVerifyInput,
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
import type { AuthActor } from "../../types/api.types";
import { AppError, AuthError, LockedRecordError, NotFoundError, ValidationError } from "../../utils/errors";
import { getSessionSecuritySettings } from "../../services/settings.service";
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
const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 5 * 60;
const ACTIVE_SESSION_EXISTS_MESSAGE =
  "This user is already signed in on another device. Please logout from that device or ask an administrator to revoke the session.";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const nowIso = (): string => new Date().toISOString();

const toSafeUser = (user: UserRecord): SafeUserProfile => ({
  id: user.id,
  company_id: user.company_id,
  employee_id: user.employee_id,
  username: user.username ?? null,
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

const hasActiveLinkedEmployee = async (env: Env, user: UserRecord): Promise<boolean> => {
  if (!user.employee_id) return true;
  const employee = await authRepository.findLinkedEmployeeLoginStatus(env, user.company_id, user.employee_id);
  return Boolean(employee && !employee.deleted_at && employee.employment_status !== "archived");
};

const validateEmailFormat = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const normalizeEmailUpdatePayload = (payload: unknown): { email: string } => {
  const value = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).email
    : undefined;
  const email = typeof value === "string" ? normalizeEmail(value) : "";

  if (!email || !validateEmailFormat(email)) {
    throw new AppError({
      code: "INVALID_EMAIL",
      title: "Invalid email",
      message: "Please enter a valid email address.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { email: "Please enter a valid email address." },
    });
  }

  return { email };
};

const assertEmailCanBeRequested = async (
  env: Env,
  user: UserRecord,
  email: string,
) => {
  if (normalizeEmail(user.email ?? "") === email) {
    throw new AppError({
      code: "EMAIL_UNCHANGED",
      title: "Email unchanged",
      message: "The new email must be different from your current email.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { email: "The new email must be different from your current email." },
    });
  }

  const existing = await authRepository.findUserByEmailInCompany(env, user.company_id, email);
  if (existing && existing.id !== user.id) {
    throw new AppError({
      code: "DUPLICATE_USER_EMAIL",
      title: "Duplicate email",
      message: "A user with this email already exists.",
      statusCode: 409,
      retryable: false,
      fieldErrors: { email: "A user with this email already exists." },
    });
  }
};

const audit = async (
  env: Env,
  input: {
    action: string;
    user?: UserRecord | null;
    request: AuthenticatedRequestContext;
    entityType?: string;
    entityId?: string;
    reason?: string;
    actorId?: string;
  },
) => {
  await createAuditLog(env, {
    companyId: input.user?.company_id,
    action: input.action,
    module: "auth",
    entityType: input.entityType ?? "user",
    entityId: input.entityId ?? input.user?.id,
    actorId: input.actorId ?? input.user?.id,
    ipAddress: input.request.ipAddress,
    userAgent: input.request.userAgent,
    reason: input.reason,
    requestId: input.request.requestId,
  }).catch(() => undefined);
};

const addMinutes = (minutes: number): string =>
  new Date(Date.now() + minutes * 60 * 1000).toISOString();

const minutesToMs = (minutes: number) => minutes * 60 * 1000;

const safeUserAgentSummary = (userAgent: string | null): string | null => {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Windows/i.test(userAgent)
    ? "Windows"
    : /Mac OS|Macintosh/i.test(userAgent)
      ? "macOS"
      : /Android/i.test(userAgent)
        ? "Android"
        : /iPhone|iPad|iOS/i.test(userAgent)
          ? "iOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
};

const safeIpSummary = (ipAddress: string | null): string | null => {
  if (!ipAddress) return null;
  if (ipAddress.includes(":")) return "IPv6 client";
  const parts = ipAddress.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : "IP client";
};

const safeDeviceLabel = (request: AuthenticatedRequestContext): string | null =>
  request.deviceId ? "Registered device" : safeUserAgentSummary(request.userAgent);

const isSessionActive = (
  session: SessionRecord,
  settings: Awaited<ReturnType<typeof getSessionSecuritySettings>>,
  now = Date.now(),
): boolean => {
  if (session.revoked_at) return false;
  const expiresAt = new Date(session.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  if (settings.session_timeout_minutes) {
    const createdAt = new Date(session.created_at).getTime();
    if (Number.isFinite(createdAt) && createdAt + minutesToMs(settings.session_timeout_minutes) <= now) return false;
  }
  if (settings.idle_timeout_minutes) {
    const lastActivity = new Date(session.last_seen_at ?? session.created_at).getTime();
    if (Number.isFinite(lastActivity) && lastActivity + minutesToMs(settings.idle_timeout_minutes) <= now) return false;
  }
  return true;
};

const safeSession = (session: SessionRecord, currentSessionId?: string | null): SafeSessionRecord => ({
  id: session.id,
  current: session.id === currentSessionId,
  device_label: session.device_label ?? null,
  user_agent_summary: session.user_agent_summary ?? safeUserAgentSummary(session.user_agent),
  ip_summary: session.ip_summary ?? safeIpSummary(session.ip_address),
  created_at: session.created_at,
  last_seen_at: session.last_seen_at,
  expires_at: session.expires_at,
  revoked_at: session.revoked_at,
});

const revokeInactiveSessions = async (
  env: Env,
  sessions: SessionRecord[],
  settings: Awaited<ReturnType<typeof getSessionSecuritySettings>>,
  reason: string,
) => {
  await Promise.all(
    sessions
      .filter((session) => !isSessionActive(session, settings))
      .map((session) => authRepository.revokeSession(env, session.id, reason).catch(() => undefined)),
  );
};

const enforceConcurrentSessionPolicy = async (
  env: Env,
  user: UserRecord,
  request: AuthenticatedRequestContext,
  settings: Awaited<ReturnType<typeof getSessionSecuritySettings>>,
) => {
  const sessions = await authRepository.listUnrevokedSessionsForUser(env, user.company_id, user.id);
  await revokeInactiveSessions(env, sessions, settings, "expired_before_login");
  const activeSessions = sessions.filter((session) => isSessionActive(session, settings));

  if (activeSessions.length === 0) return;

  if (settings.concurrent_session_policy === "revoke_old_session") {
    await authRepository.revokeUserSessions(env, user.id, undefined, "replaced_by_new_login", user.id);
    await audit(env, {
      action: "old_sessions_revoked_by_new_login",
      user,
      request,
      entityType: "session",
      entityId: user.id,
      reason: "Concurrent session policy replaced old sessions.",
    });
    return;
  }

  await audit(env, {
    action: "login_blocked_active_session_exists",
    user,
    request,
    entityType: "session",
    entityId: user.id,
    reason: "Concurrent session policy blocked new login.",
  });
  throw new AppError({
    code: "ACTIVE_SESSION_EXISTS",
    title: "Already signed in",
    message: ACTIVE_SESSION_EXISTS_MESSAGE,
    statusCode: 409,
    retryable: false,
  });
};

const createLoginSession = async (
  env: Env,
  user: UserRecord,
  request: AuthenticatedRequestContext,
) => {
  const sessionSettings = await getSessionSecuritySettings(env, user.company_id);
  await enforceConcurrentSessionPolicy(env, user, request, sessionSettings);
  const sessionToken = await createSessionToken(env.SESSION_SECRET, sessionSettings);

  await authRepository.createSession(env, {
    id: sessionToken.id,
    companyId: user.company_id,
    userId: user.id,
    tokenHash: sessionToken.tokenHash,
    ipAddress: request.ipAddress,
    userAgent: request.userAgent,
    deviceId: request.deviceId,
    expiresAt: sessionToken.expiresAt,
    deviceLabel: sessionSettings.session_device_tracking_enabled ? safeDeviceLabel(request) : null,
    userAgentSummary: sessionSettings.session_device_tracking_enabled ? safeUserAgentSummary(request.userAgent) : null,
    ipSummary: sessionSettings.session_device_tracking_enabled ? safeIpSummary(request.ipAddress) : null,
  });

  return sessionToken;
};

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

const base64UrlEncode = (value: string): string =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const base64UrlDecode = (value: string): string => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
};

const signChallengePayload = async (payload: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey("raw", encodeUtf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encodeUtf8(payload)));
  return bytesToBase64(signature).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const createTwoFactorChallenge = async (env: Env, user: UserRecord): Promise<string> => {
  const payload = base64UrlEncode(JSON.stringify({
    user_id: user.id,
    company_id: user.company_id,
    exp: Math.floor(Date.now() / 1000) + TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    nonce: bytesToBase64(randomBytes(12)),
  }));
  const signature = await signChallengePayload(payload, env.SESSION_SECRET);
  return `${payload}.${signature}`;
};

const verifyTwoFactorChallenge = async (env: Env, challengeId: string): Promise<{ user_id: string; company_id: string }> => {
  const [payload, signature] = challengeId.split(".");
  if (!payload || !signature) {
    throw new AppError({
      code: "TWO_FACTOR_SETUP_EXPIRED",
      title: "Two-factor verification expired",
      message: "Two-factor verification has expired. Please log in again.",
      statusCode: 401,
      retryable: false,
    });
  }
  const expectedSignature = await signChallengePayload(payload, env.SESSION_SECRET);
  if (!constantTimeEqual(signature, expectedSignature)) {
    throw new AppError({
      code: "TWO_FACTOR_SETUP_EXPIRED",
      title: "Two-factor verification expired",
      message: "Two-factor verification has expired. Please log in again.",
      statusCode: 401,
      retryable: false,
    });
  }
  const parsed = JSON.parse(base64UrlDecode(payload)) as { user_id?: string; company_id?: string; exp?: number };
  if (!parsed.user_id || !parsed.company_id || !parsed.exp || parsed.exp <= Math.floor(Date.now() / 1000)) {
    throw new AppError({
      code: "TWO_FACTOR_SETUP_EXPIRED",
      title: "Two-factor verification expired",
      message: "Two-factor verification has expired. Please log in again.",
      statusCode: 401,
      retryable: false,
    });
  }
  return { user_id: parsed.user_id, company_id: parsed.company_id };
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

export const generateTotpCodeForSecret = async (secret: string, timestamp = Date.now()): Promise<string> => {
  const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);
  return hotp(decodeBase32(secret), counter);
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
  const loginIdentifier = (input.identifier ?? input.email ?? "").trim().toLowerCase();
  const user = await authRepository.findUserByLoginIdentifier(env, loginIdentifier);

  if (!user || !isActiveUser(user) || !(await hasActiveLinkedEmployee(env, user))) {
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
      const challengeId = await createTwoFactorChallenge(env, user);
      return {
        response: {
          two_factor_required: true,
          method: "totp",
          challenge_id: challengeId,
        },
        message: "Enter the 6-digit code from your authenticator app.",
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
      throw new AppError({
        code: "INVALID_TWO_FACTOR_CODE",
        title: "Invalid two-factor code",
        message: "The verification code is invalid or has expired.",
        statusCode: 401,
        retryable: false,
      });
    }

    if (backupValid) {
      await audit(env, { action: "backup_code_used", user, request });
    }
  }

  await authRepository.resetFailedLogin(env, user.id);
  const sessionToken = await createLoginSession(env, user, request);
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

export const verifyLoginTwoFactorChallenge = async (
  env: Env,
  input: TwoFactorChallengeVerifyInput,
  request: AuthenticatedRequestContext,
) => {
  const challenge = await verifyTwoFactorChallenge(env, input.challenge_id);
  const user = await ensureAuthenticated(env, challenge.user_id);
  if (user.company_id !== challenge.company_id || user.two_factor_enabled !== 1) {
    throw new AppError({
      code: "TWO_FACTOR_NOT_ENABLED",
      title: "Two-factor authentication not enabled",
      message: "Two-factor authentication is not enabled for this account.",
      statusCode: 400,
      retryable: false,
    });
  }

  const twoFactor = await authRepository.getTwoFactorByUserId(env, user.id);
  if (!twoFactor?.secret_encrypted || twoFactor.disabled_at) {
    throw new AppError({
      code: "TWO_FACTOR_NOT_ENABLED",
      title: "Two-factor authentication not enabled",
      message: "Two-factor authentication is not enabled for this account.",
      statusCode: 400,
      retryable: false,
    });
  }

  const totpValid = input.code
    ? await verifyTotpCode(
        await decryptTotpSecret(twoFactor.secret_encrypted, env.TOTP_ENCRYPTION_KEY),
        input.code,
      )
    : false;
  const backupValid = !totpValid && input.backup_code ? await consumeBackupCode(env, twoFactor, input.backup_code) : false;

  if (!totpValid && !backupValid) {
    await audit(env, { action: "two_factor_failed", user, request });
    throw new AppError({
      code: "INVALID_TWO_FACTOR_CODE",
      title: "Invalid two-factor code",
      message: "The verification code is invalid or has expired.",
      statusCode: 401,
      retryable: false,
    });
  }

  await authRepository.resetFailedLogin(env, user.id);
  const sessionToken = await createLoginSession(env, user, request);
  await audit(env, { action: backupValid ? "backup_code_used" : "login_success", user, request });

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
  const [activeSessionsCount, twoFactor] = await Promise.all([
    authRepository.countActiveSessions(env, user.id),
    authRepository.getTwoFactorByUserId(env, user.id),
  ]);
  const backupCodes = twoFactor ? parseBackupCodes(twoFactor) : [];

  return {
    password_updated_at: user.password_updated_at,
    two_factor_enabled: user.two_factor_enabled === 1,
    enabled: user.two_factor_enabled === 1,
    verified_at: twoFactor?.enabled_at ?? null,
    backup_codes_remaining: backupCodes.filter((code) => !code.used_at).length,
    active_sessions_count: activeSessionsCount,
    last_login_at: user.last_login_at,
  };
};

export const listOwnSessions = async (
  env: Env,
  userId: string,
  currentSessionId?: string | null,
): Promise<SafeSessionRecord[]> => {
  const user = await ensureAuthenticated(env, userId);
  const settings = await getSessionSecuritySettings(env, user.company_id);
  const sessions = await authRepository.listUnrevokedSessionsForUser(env, user.company_id, user.id);
  await revokeInactiveSessions(env, sessions, settings, "expired_before_session_list");

  return sessions
    .filter((session) => isSessionActive(session, settings))
    .map((session) => safeSession(session, currentSessionId));
};

export const revokeOwnSession = async (
  env: Env,
  userId: string,
  targetSessionId: string,
  currentSessionId: string | undefined,
  request: AuthenticatedRequestContext,
) => {
  const user = await ensureAuthenticated(env, userId);
  const session = await authRepository.findSessionById(env, user.company_id, targetSessionId);

  if (!session || session.user_id !== user.id) {
    throw new NotFoundError("The requested session could not be found.");
  }

  await authRepository.revokeSession(env, session.id, "user_revoked_own_session", user.id);
  await audit(env, {
    action: "user_revoked_own_session",
    user,
    request,
    entityType: "session",
    entityId: session.id,
    reason: "User revoked own active session.",
  });

  const revokingCurrentSession = session.id === currentSessionId;
  return {
    response: { revoked: true, current_session_revoked: revokingCurrentSession },
    cookie: revokingCurrentSession ? buildClearSessionCookie() : undefined,
    message: revokingCurrentSession ? "This session has been revoked." : "The session has been revoked.",
  };
};

const assertAdminCanAccessUserSessions = async (
  env: Env,
  actor: AuthActor,
  userId: string,
): Promise<UserRecord> => {
  const user = await authRepository.findUserById(env, userId);
  if (!user || user.company_id !== actor.companyId || user.deleted_at) {
    throw new NotFoundError("The requested user could not be found.");
  }
  return user;
};

export const listUserSessionsForAdmin = async (
  env: Env,
  actor: AuthActor,
  userId: string,
): Promise<SafeSessionRecord[]> => {
  const user = await assertAdminCanAccessUserSessions(env, actor, userId);
  const settings = await getSessionSecuritySettings(env, user.company_id);
  const sessions = await authRepository.listUnrevokedSessionsForUser(env, user.company_id, user.id);
  await revokeInactiveSessions(env, sessions, settings, "expired_before_admin_session_list");

  return sessions
    .filter((session) => isSessionActive(session, settings))
    .map((session) => safeSession(session));
};

export const revokeUserSessionForAdmin = async (
  env: Env,
  actor: AuthActor,
  userId: string,
  targetSessionId: string,
  reason: string,
  request: AuthenticatedRequestContext,
) => {
  const user = await assertAdminCanAccessUserSessions(env, actor, userId);
  const session = await authRepository.findSessionById(env, user.company_id, targetSessionId);
  if (!session || session.user_id !== user.id) {
    throw new NotFoundError("The requested session could not be found.");
  }

  await authRepository.revokeSession(env, session.id, "admin_revoked_session", actor.actorUserId);
  await audit(env, {
    action: "admin_revoked_session",
    user,
    request,
    entityType: "session",
    entityId: session.id,
    actorId: actor.actorUserId,
    reason,
  });

  return {
    response: { revoked: true },
    message: "The session has been revoked.",
  };
};

export const revokeAllUserSessionsForAdmin = async (
  env: Env,
  actor: AuthActor,
  userId: string,
  reason: string,
  request: AuthenticatedRequestContext,
) => {
  const user = await assertAdminCanAccessUserSessions(env, actor, userId);
  await authRepository.revokeUserSessions(env, user.id, undefined, "admin_revoked_all_sessions", actor.actorUserId);
  await audit(env, {
    action: "admin_revoked_all_sessions",
    user,
    request,
    entityType: "session",
    entityId: user.id,
    actorId: actor.actorUserId,
    reason,
  });

  return {
    response: { revoked: true },
    message: "All active sessions for this user have been revoked.",
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
  const existing = await authRepository.getTwoFactorByUserId(env, user.id);
  if (user.two_factor_enabled === 1 && existing?.enabled_at && !existing.disabled_at) {
    throw new AppError({
      code: "TWO_FACTOR_ALREADY_ENABLED",
      title: "Two-factor authentication already enabled",
      message: "Two-factor authentication is already enabled.",
      statusCode: 409,
      retryable: false,
    });
  }
  const secret = encodeBase32(randomBytes(20));
  const encryptedSecret = await encryptTotpSecret(secret, env.TOTP_ENCRYPTION_KEY);
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
      otpauth_url: `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&period=${TOTP_PERIOD_SECONDS}&digits=${TOTP_DIGITS}`,
      manual_key: secret.replace(/(.{4})/g, "$1 ").trim(),
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
    throw new AppError({
      code: "TWO_FACTOR_SETUP_NOT_STARTED",
      title: "Two-factor setup not started",
      message: "Two-factor authentication setup has not been started.",
      statusCode: 400,
      retryable: false,
    });
  }

  const secret = await decryptTotpSecret(
    twoFactor.secret_encrypted,
    env.TOTP_ENCRYPTION_KEY,
  );
  const isValid = await verifyTotpCode(secret, input.code);

  if (!isValid) {
    await audit(env, { action: "two_factor_failed", user, request });
    throw new AppError({
      code: "INVALID_TWO_FACTOR_CODE",
      title: "Invalid two-factor code",
      message: "The verification code is invalid or has expired.",
      statusCode: 401,
      retryable: false,
    });
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
    response: backupCodes ? { enabled: true, backup_codes: backupCodes } : { enabled: true },
    message: "Two-factor authentication has been enabled.",
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

  if (user.two_factor_enabled !== 1 || !twoFactor || twoFactor.disabled_at) {
    throw new AppError({
      code: "TWO_FACTOR_NOT_ENABLED",
      title: "Two-factor authentication not enabled",
      message: "Two-factor authentication is not enabled.",
      statusCode: 400,
      retryable: false,
    });
  }

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
    throw new AppError({
      code: "INVALID_TWO_FACTOR_CODE",
      title: "Invalid two-factor code",
      message: "We could not confirm your identity. Please try again.",
      statusCode: 401,
      retryable: false,
    });
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
  let requestedValueJson = input.requested_value_json;
  let oldValueJson: string | null = null;

  if (input.request_type === "email_update") {
    const emailUpdate = normalizeEmailUpdatePayload(input.requested_value_json);
    if (!input.reason?.trim()) {
      throw new AppError({
        code: "EMAIL_UPDATE_REASON_REQUIRED",
        title: "Reason required",
        message: "Please provide a reason for changing your login email.",
        statusCode: 400,
        retryable: false,
        fieldErrors: { reason: "Please provide a reason for changing your login email." },
      });
    }
    await assertEmailCanBeRequested(env, user, emailUpdate.email);
    requestedValueJson = emailUpdate;
    oldValueJson = JSON.stringify({ email: user.email ?? null });
  }

  if (input.request_type === "emergency_contact_update") {
    const raw = typeof input.requested_value_json === "object" && input.requested_value_json !== null
      ? input.requested_value_json as Record<string, unknown>
      : {};
    requestedValueJson = {
      emergency_contact_name:
        typeof raw.emergency_contact_name === "string" && raw.emergency_contact_name.trim()
          ? raw.emergency_contact_name.trim()
          : typeof raw.emergency_contact === "string" && raw.emergency_contact.trim()
            ? raw.emergency_contact.trim()
            : undefined,
      emergency_contact_phone:
        typeof raw.emergency_contact_phone === "string" && raw.emergency_contact_phone.trim()
          ? raw.emergency_contact_phone.trim()
          : undefined,
      emergency_contact_relation:
        typeof raw.emergency_contact_relation === "string" && raw.emergency_contact_relation.trim()
          ? raw.emergency_contact_relation.trim()
          : undefined,
    };
  }

  const requestId = createEntityId("user").replace("user_", "kyc_");

  await authRepository.createKycRequest(env, {
    id: requestId,
    companyId: user.company_id,
    userId: user.id,
    employeeId: user.employee_id,
    requestType: input.request_type,
    requestedValueJson: JSON.stringify(requestedValueJson),
    oldValueJson,
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
