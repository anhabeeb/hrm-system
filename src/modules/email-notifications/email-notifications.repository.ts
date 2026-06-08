import type {
  EmailListFilters,
  EmailNotificationRecord,
  EmailPreference,
  EmailSettingsRecord,
} from "./email-notifications.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();

const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const run = (env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).run();

const buildListWhere = (companyId: string, filters: EmailListFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  if (filters.category) {
    clauses.push("category = ?");
    values.push(filters.category);
  }
  if (filters.priority) {
    clauses.push("priority = ?");
    values.push(filters.priority);
  }
  if (filters.notification_type) {
    clauses.push("notification_type = ?");
    values.push(filters.notification_type);
  }
  if (filters.recipient_user_id) {
    clauses.push("recipient_user_id = ?");
    values.push(filters.recipient_user_id);
  }
  if (filters.entity_type) {
    clauses.push("entity_type = ?");
    values.push(filters.entity_type);
  }
  if (filters.entity_id) {
    clauses.push("entity_id = ?");
    values.push(filters.entity_id);
  }
  if (filters.from_date) {
    clauses.push("created_at >= ?");
    values.push(filters.from_date);
  }
  if (filters.to_date) {
    clauses.push("created_at <= ?");
    values.push(filters.to_date);
  }
  return { sql: clauses.join(" AND "), values };
};

export const findUserEmail = (env: Env, companyId: string, userId: string) =>
  one<{ id: string; employee_id: string | null; email: string | null; full_name: string | null; status: string | null }>(
    env,
    "SELECT id, employee_id, email, full_name, status FROM users WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, userId],
  );

export const findEmailJobByIdempotencyKey = (env: Env, companyId: string, idempotencyKey: string) =>
  one<EmailNotificationRecord>(
    env,
    "SELECT * FROM email_notifications WHERE company_id = ? AND idempotency_key = ? LIMIT 1",
    [companyId, idempotencyKey],
  );

export const createEmailJob = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    inAppNotificationId?: string | null;
    recipientUserId?: string | null;
    recipientEmployeeId?: string | null;
    recipientEmail?: string | null;
    recipientName?: string | null;
    notificationType: string;
    category: string;
    priority: string;
    subject: string;
    textBody: string;
    htmlBody?: string | null;
    templateKey?: string | null;
    templateVersion?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    eventKey?: string | null;
    idempotencyKey?: string | null;
    status: string;
    provider?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    createdBy?: string | null;
    createdAt: string;
    metadataJson?: string | null;
  },
) =>
  run(
    env,
    `INSERT INTO email_notifications (
      id, company_id, in_app_notification_id, recipient_user_id, recipient_employee_id,
      recipient_email, recipient_name, notification_type, category, priority,
      subject, text_body, html_body, template_key, template_version, entity_type,
      entity_id, event_key, idempotency_key, status, provider, failure_code,
      failure_message, created_by, created_at, updated_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.inAppNotificationId ?? null,
      input.recipientUserId ?? null,
      input.recipientEmployeeId ?? null,
      input.recipientEmail ?? null,
      input.recipientName ?? null,
      input.notificationType,
      input.category,
      input.priority,
      input.subject,
      input.textBody,
      input.htmlBody ?? null,
      input.templateKey ?? null,
      input.templateVersion ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.eventKey ?? null,
      input.idempotencyKey ?? null,
      input.status,
      input.provider ?? null,
      input.failureCode ?? null,
      input.failureMessage ?? null,
      input.createdBy ?? null,
      input.createdAt,
      input.createdAt,
      input.metadataJson ?? null,
    ],
  );

export const getEmailJob = (env: Env, companyId: string, id: string) =>
  one<EmailNotificationRecord>(env, "SELECT * FROM email_notifications WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const countEmailJobs = async (env: Env, companyId: string, filters: EmailListFilters) => {
  const built = buildListWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM email_notifications WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listEmailJobs = (env: Env, companyId: string, filters: EmailListFilters) => {
  const built = buildListWhere(companyId, filters);
  return many<EmailNotificationRecord>(
    env,
    `SELECT * FROM email_notifications WHERE ${built.sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const listPendingEmailJobs = (env: Env, companyId: string, limit: number) =>
  many<EmailNotificationRecord>(
    env,
    "SELECT * FROM email_notifications WHERE company_id = ? AND status IN ('pending', 'queued', 'failed') ORDER BY created_at ASC LIMIT ?",
    [companyId, limit],
  );

export const updateAttempt = (env: Env, companyId: string, id: string, timestamp: string) =>
  run(
    env,
    "UPDATE email_notifications SET attempt_count = attempt_count + 1, last_attempt_at = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [timestamp, timestamp, companyId, id],
  );

export const markSent = (
  env: Env,
  input: { companyId: string; id: string; provider: string; providerMessageId?: string | null; timestamp: string },
) =>
  run(
    env,
    `UPDATE email_notifications
        SET status = 'sent', provider = ?, provider_message_id = ?, sent_at = ?, failed_at = NULL,
            failure_code = NULL, failure_message = NULL, updated_at = ?
      WHERE company_id = ? AND id = ?`,
    [input.provider, input.providerMessageId ?? null, input.timestamp, input.timestamp, input.companyId, input.id],
  );

export const markFailed = (
  env: Env,
  input: { companyId: string; id: string; status?: string; failureCode: string; failureMessage: string; provider?: string | null; timestamp: string },
) =>
  run(
    env,
    `UPDATE email_notifications
        SET status = ?, provider = COALESCE(?, provider), failed_at = ?, failure_code = ?, failure_message = ?, updated_at = ?
      WHERE company_id = ? AND id = ?`,
    [
      input.status ?? "failed",
      input.provider ?? null,
      input.timestamp,
      input.failureCode,
      input.failureMessage,
      input.timestamp,
      input.companyId,
      input.id,
    ],
  );

export const getPreferences = (env: Env, companyId: string, userId: string) =>
  many<EmailPreference>(
    env,
    "SELECT * FROM email_notification_preferences WHERE company_id = ? AND user_id = ? ORDER BY category",
    [companyId, userId],
  );

export const preferenceForCategory = (env: Env, companyId: string, userId: string, category: string) =>
  one<EmailPreference>(
    env,
    "SELECT * FROM email_notification_preferences WHERE company_id = ? AND user_id = ? AND category = ? LIMIT 1",
    [companyId, userId, category],
  );

export const upsertPreference = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    userId: string;
    category: string;
    enabled: number;
    minimumPriority: string;
    mutedUntil?: string | null;
    digestEnabled: number;
    timestamp: string;
  },
) =>
  run(
    env,
    `INSERT INTO email_notification_preferences (
      id, company_id, user_id, category, email_enabled, minimum_priority_for_email,
      muted_until, digest_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, user_id, category) DO UPDATE SET
      email_enabled = excluded.email_enabled,
      minimum_priority_for_email = excluded.minimum_priority_for_email,
      muted_until = excluded.muted_until,
      digest_enabled = excluded.digest_enabled,
      updated_at = excluded.updated_at`,
    [
      input.id,
      input.companyId,
      input.userId,
      input.category,
      input.enabled,
      input.minimumPriority,
      input.mutedUntil ?? null,
      input.digestEnabled,
      input.timestamp,
      input.timestamp,
    ],
  );

export const getSettings = (env: Env, companyId: string) =>
  one<EmailSettingsRecord>(
    env,
    "SELECT * FROM email_notification_settings WHERE company_id = ? LIMIT 1",
    [companyId],
  );

export const upsertSettings = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    enabled: number;
    providerName?: string | null;
    allowedCategoriesJson?: string | null;
    minimumPriority: string;
    sendImmediately: number;
    adminFailureNotifications: number;
    updatedBy?: string | null;
    reason: string;
    timestamp: string;
  },
) =>
  run(
    env,
    `INSERT INTO email_notification_settings (
      id, company_id, enabled, provider_name, allowed_categories_json, minimum_priority,
      send_immediately, admin_failure_notifications, updated_by, updated_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id) DO UPDATE SET
      enabled = excluded.enabled,
      provider_name = excluded.provider_name,
      allowed_categories_json = excluded.allowed_categories_json,
      minimum_priority = excluded.minimum_priority,
      send_immediately = excluded.send_immediately,
      admin_failure_notifications = excluded.admin_failure_notifications,
      updated_by = excluded.updated_by,
      updated_reason = excluded.updated_reason,
      updated_at = excluded.updated_at`,
    [
      input.id,
      input.companyId,
      input.enabled,
      input.providerName ?? null,
      input.allowedCategoriesJson ?? null,
      input.minimumPriority,
      input.sendImmediately,
      input.adminFailureNotifications,
      input.updatedBy ?? null,
      input.reason,
      input.timestamp,
      input.timestamp,
    ],
  );

export const logDelivery = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    emailNotificationId?: string | null;
    status: string;
    provider?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    metadataJson?: string | null;
    createdAt: string;
  },
) =>
  run(
    env,
    `INSERT INTO email_delivery_logs (
      id, company_id, email_notification_id, status, provider, failure_code,
      failure_message, created_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.emailNotificationId ?? null,
      input.status,
      input.provider ?? null,
      input.failureCode ?? null,
      input.failureMessage ?? null,
      input.createdAt,
      input.metadataJson ?? null,
    ],
  );
