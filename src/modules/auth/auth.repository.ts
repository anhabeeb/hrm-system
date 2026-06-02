import type {
  KycRequestRecord,
  PasswordResetTokenRecord,
  SessionRecord,
  TwoFactorRecord,
  UserRecord,
} from "./auth.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const queryOne = async <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T | null> => bind(env.DB.prepare(sql), values).first<T>();

const queryMany = async <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T[]> => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const execute = async (
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
) => bind(env.DB.prepare(sql), values).run();

export const findUserByEmail = (env: Env, email: string): Promise<UserRecord | null> =>
  queryOne<UserRecord>(
    env,
    "SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1",
    [email],
  );

export const findUserById = (env: Env, id: string): Promise<UserRecord | null> =>
  queryOne<UserRecord>(env, "SELECT * FROM users WHERE id = ? LIMIT 1", [id]);

export const getUserRoles = (env: Env, userId: string): Promise<string[]> =>
  queryMany<{ role_key: string }>(
    env,
    `SELECT r.role_key
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.is_active = 1`,
    [userId],
  ).then((rows) => rows.map((row) => row.role_key));

export const getUserPermissions = (env: Env, userId: string): Promise<string[]> =>
  queryMany<{ permission_key: string }>(
    env,
    `SELECT DISTINCT rp.permission_key
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.is_active = 1
     UNION
     SELECT permission_key
     FROM user_permission_overrides
     WHERE user_id = ? AND is_allowed = 1`,
    [userId, userId],
  ).then((rows) => rows.map((row) => row.permission_key));

export const getUserOutletIds = (env: Env, userId: string): Promise<string[]> =>
  queryMany<{ outlet_id: string }>(
    env,
    "SELECT outlet_id FROM user_outlets WHERE user_id = ? AND (ends_at IS NULL OR ends_at > ?)",
    [userId, new Date().toISOString()],
  ).then((rows) => rows.map((row) => row.outlet_id));

export const getEnabledFeatureKeys = (env: Env, companyId: string): Promise<string[]> =>
  queryMany<{ feature_key: string }>(
    env,
    `SELECT feature_key
     FROM feature_settings
     WHERE company_id = ?
       AND is_enabled = 1
       AND status IN ('active', 'enabled')`,
    [companyId],
  ).then((rows) => rows.map((row) => row.feature_key));

export const updateFailedLogin = (
  env: Env,
  userId: string,
  failedAttempts: number,
  lockedUntil: string | null,
) =>
  execute(
    env,
    "UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?",
    [failedAttempts, lockedUntil, new Date().toISOString(), userId],
  );

export const resetFailedLogin = (env: Env, userId: string) =>
  execute(
    env,
    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?",
    [new Date().toISOString(), new Date().toISOString(), userId],
  );

export const updatePassword = (
  env: Env,
  userId: string,
  passwordHash: string,
  passwordAlgo: string,
) =>
  execute(
    env,
    `UPDATE users
     SET password_hash = ?,
         password_algo = ?,
         password_updated_at = ?,
         last_password_reset_at = ?,
         password_reset_required = 0,
         updated_at = ?
     WHERE id = ?`,
    [
      passwordHash,
      passwordAlgo,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
      userId,
    ],
  );

export const createSession = (
  env: Env,
  session: {
    id: string;
    companyId: string;
    userId: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    deviceId: string | null;
    expiresAt: string;
  },
) =>
  execute(
    env,
    `INSERT INTO sessions (
      id, company_id, user_id, session_token_hash, ip_address, user_agent,
      device_id, expires_at, revoked_at, created_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      session.id,
      session.companyId,
      session.userId,
      session.tokenHash,
      session.ipAddress,
      session.userAgent,
      session.deviceId,
      session.expiresAt,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const findSessionByTokenHash = (
  env: Env,
  tokenHash: string,
): Promise<SessionRecord | null> =>
  queryOne<SessionRecord>(
    env,
    "SELECT * FROM sessions WHERE session_token_hash = ? LIMIT 1",
    [tokenHash],
  );

export const touchSession = (env: Env, sessionId: string) =>
  execute(env, "UPDATE sessions SET last_seen_at = ? WHERE id = ?", [
    new Date().toISOString(),
    sessionId,
  ]);

export const revokeSession = (env: Env, sessionId: string) =>
  execute(env, "UPDATE sessions SET revoked_at = ? WHERE id = ?", [
    new Date().toISOString(),
    sessionId,
  ]);

export const revokeUserSessions = (env: Env, userId: string, exceptSessionId?: string) => {
  if (exceptSessionId) {
    return execute(
      env,
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL",
      [new Date().toISOString(), userId, exceptSessionId],
    );
  }

  return execute(
    env,
    "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    [new Date().toISOString(), userId],
  );
};

export const countActiveSessions = async (env: Env, userId: string): Promise<number> => {
  const row = await queryOne<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?",
    [userId, new Date().toISOString()],
  );

  return row?.total ?? 0;
};

export const createPasswordResetToken = (
  env: Env,
  token: {
    id: string;
    companyId: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
  },
) =>
  execute(
    env,
    `INSERT INTO password_reset_tokens (
      id, company_id, user_id, token_hash, expires_at, used_at, created_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    [
      token.id,
      token.companyId,
      token.userId,
      token.tokenHash,
      token.expiresAt,
      new Date().toISOString(),
    ],
  );

export const findPasswordResetToken = (
  env: Env,
  tokenHash: string,
): Promise<PasswordResetTokenRecord | null> =>
  queryOne<PasswordResetTokenRecord>(
    env,
    "SELECT * FROM password_reset_tokens WHERE token_hash = ? LIMIT 1",
    [tokenHash],
  );

export const markPasswordResetTokenUsed = (env: Env, tokenId: string) =>
  execute(env, "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?", [
    new Date().toISOString(),
    tokenId,
  ]);

export const getTwoFactorByUserId = (
  env: Env,
  userId: string,
): Promise<TwoFactorRecord | null> =>
  queryOne<TwoFactorRecord>(
    env,
    "SELECT * FROM user_two_factor WHERE user_id = ? AND method = 'totp' LIMIT 1",
    [userId],
  );

export const createOrUpdateTwoFactor = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    userId: string;
    secretEncrypted: string;
    backupCodesHashJson: string | null;
    enabledAt: string | null;
  },
) =>
  execute(
    env,
    `INSERT INTO user_two_factor (
      id, company_id, user_id, method, secret_encrypted, backup_codes_hash_json,
      enabled_at, disabled_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'totp', ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      secret_encrypted = excluded.secret_encrypted,
      backup_codes_hash_json = excluded.backup_codes_hash_json,
      enabled_at = excluded.enabled_at,
      disabled_at = NULL,
      updated_at = excluded.updated_at`,
    [
      input.id,
      input.companyId,
      input.userId,
      input.secretEncrypted,
      input.backupCodesHashJson,
      input.enabledAt,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateTwoFactorBackupCodes = (
  env: Env,
  twoFactorId: string,
  backupCodesHashJson: string,
) =>
  execute(
    env,
    "UPDATE user_two_factor SET backup_codes_hash_json = ?, updated_at = ? WHERE id = ?",
    [backupCodesHashJson, new Date().toISOString(), twoFactorId],
  );

export const setUserTwoFactorEnabled = (
  env: Env,
  userId: string,
  enabled: boolean,
) =>
  execute(
    env,
    "UPDATE users SET two_factor_enabled = ?, updated_at = ? WHERE id = ?",
    [enabled ? 1 : 0, new Date().toISOString(), userId],
  );

export const disableTwoFactor = (env: Env, userId: string) =>
  execute(
    env,
    `UPDATE user_two_factor
     SET disabled_at = ?, updated_at = ?
     WHERE user_id = ? AND method = 'totp'`,
    [new Date().toISOString(), new Date().toISOString(), userId],
  );

export const createKycRequest = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    userId: string;
    employeeId: string | null;
    requestType: string;
    requestedValueJson: string;
    reason: string | null;
  },
) =>
  execute(
    env,
    `INSERT INTO user_profile_update_requests (
      id, company_id, user_id, employee_id, request_type, old_value_json,
      requested_value_json, reason, status, reviewed_by, reviewed_at,
      review_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.userId,
      input.employeeId,
      input.requestType,
      input.requestedValueJson,
      input.reason,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const listOwnKycRequests = (
  env: Env,
  userId: string,
): Promise<KycRequestRecord[]> =>
  queryMany<KycRequestRecord>(
    env,
    "SELECT * FROM user_profile_update_requests WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );

export const findOwnKycRequest = (
  env: Env,
  userId: string,
  requestId: string,
): Promise<KycRequestRecord | null> =>
  queryOne<KycRequestRecord>(
    env,
    "SELECT * FROM user_profile_update_requests WHERE id = ? AND user_id = ? LIMIT 1",
    [requestId, userId],
  );
