import type {
  NotificationListFilters,
  NotificationPayload,
  NotificationPreference,
  NotificationRecord,
} from "./notifications.types";

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

export const findNotificationByIdempotencyKey = (
  env: Env,
  companyId: string,
  idempotencyKey: string,
) =>
  one<NotificationRecord>(
    env,
    "SELECT *, COALESCE(recipient_user_id, user_id) AS recipient_user_id FROM notifications WHERE company_id = ? AND idempotency_key = ? LIMIT 1",
    [companyId, idempotencyKey],
  );

export const createNotification = (
  env: Env,
  input: NotificationPayload & {
    id: string;
    companyId: string;
    recipientUserId: string;
    createdBy?: string | null;
    metadataJson?: string | null;
    createdAt: string;
  },
) =>
  run(
    env,
    `INSERT INTO notifications (
      id, company_id, user_id, recipient_user_id, recipient_employee_id,
      recipient_role_key, recipient_permission_key, outlet_id, department_id,
      notification_type, category, priority, title, message, action_url,
      action_label, entity_type, entity_id, event_key, idempotency_key, status,
      is_read, read_at, archived_at, dismissed_at, created_by, created_at,
      expires_at, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', 0, NULL, NULL, NULL, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.recipientUserId,
      input.recipientUserId,
      input.recipient_employee_id ?? null,
      input.recipient_role_key ?? null,
      input.recipient_permission_key ?? null,
      input.outlet_id ?? null,
      input.department_id ?? null,
      input.notification_type,
      input.category,
      input.priority ?? "normal",
      input.title,
      input.message ?? null,
      input.action_url ?? null,
      input.action_label ?? null,
      input.entity_type ?? null,
      input.entity_id ?? null,
      input.event_key ?? null,
      input.idempotency_key ?? null,
      input.createdBy ?? null,
      input.createdAt,
      input.expires_at ?? null,
      input.metadataJson ?? null,
      input.createdAt,
    ],
  );

const buildListWhere = (companyId: string, userId: string, filters: NotificationListFilters) => {
  const clauses = ["company_id = ?", "COALESCE(recipient_user_id, user_id) = ?"];
  const values: unknown[] = [companyId, userId];

  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  } else if (!filters.include_archived) {
    clauses.push("status NOT IN ('archived', 'dismissed')");
  }
  if (filters.unread_only) clauses.push("status = 'unread'");
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
  clauses.push("(expires_at IS NULL OR expires_at > ? OR status IN ('read', 'archived', 'dismissed'))");
  values.push(new Date().toISOString());
  return { sql: clauses.join(" AND "), values };
};

export const countNotifications = async (
  env: Env,
  companyId: string,
  userId: string,
  filters: NotificationListFilters,
) => {
  const built = buildListWhere(companyId, userId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM notifications WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listNotifications = (
  env: Env,
  companyId: string,
  userId: string,
  filters: NotificationListFilters,
) => {
  const built = buildListWhere(companyId, userId, filters);
  return many<NotificationRecord>(
    env,
    `SELECT *, COALESCE(recipient_user_id, user_id) AS recipient_user_id
       FROM notifications
      WHERE ${built.sql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const getNotificationForUser = (env: Env, companyId: string, userId: string, id: string) =>
  one<NotificationRecord>(
    env,
    `SELECT *, COALESCE(recipient_user_id, user_id) AS recipient_user_id
       FROM notifications
      WHERE company_id = ? AND id = ? AND COALESCE(recipient_user_id, user_id) = ?
      LIMIT 1`,
    [companyId, id, userId],
  );

export const updateNotificationStatus = (
  env: Env,
  companyId: string,
  userId: string,
  id: string,
  status: "unread" | "read" | "archived" | "dismissed",
  timestamp: string,
) => {
  const readAt = status === "read" ? timestamp : null;
  const archivedAt = status === "archived" ? timestamp : null;
  const dismissedAt = status === "dismissed" ? timestamp : null;
  return run(
    env,
    `UPDATE notifications
        SET status = ?,
            is_read = CASE WHEN ? = 'read' THEN 1 ELSE 0 END,
            read_at = CASE WHEN ? = 'read' THEN COALESCE(read_at, ?) WHEN ? = 'unread' THEN NULL ELSE read_at END,
            archived_at = CASE WHEN ? = 'archived' THEN COALESCE(archived_at, ?) ELSE archived_at END,
            dismissed_at = CASE WHEN ? = 'dismissed' THEN COALESCE(dismissed_at, ?) ELSE dismissed_at END,
            updated_at = ?
      WHERE company_id = ? AND id = ? AND COALESCE(recipient_user_id, user_id) = ?`,
    [
      status,
      status,
      status,
      readAt,
      status,
      status,
      archivedAt,
      status,
      dismissedAt,
      timestamp,
      companyId,
      id,
      userId,
    ],
  );
};

export const markAllRead = (
  env: Env,
  companyId: string,
  userId: string,
  filters: Pick<NotificationListFilters, "category" | "priority" | "notification_type" | "entity_type" | "entity_id">,
  timestamp: string,
) => {
  const built = buildListWhere(companyId, userId, { ...filters, status: "unread", page: 1, page_size: 100 });
  return run(
    env,
    `UPDATE notifications SET status = 'read', is_read = 1, read_at = COALESCE(read_at, ?), updated_at = ? WHERE ${built.sql}`,
    [timestamp, timestamp, ...built.values],
  );
};

export const unreadCount = (env: Env, companyId: string, userId: string) =>
  one<{ unread_count: number; urgent_count: number }>(
    env,
    `SELECT
       SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) AS unread_count,
       SUM(CASE WHEN status = 'unread' AND priority = 'urgent' THEN 1 ELSE 0 END) AS urgent_count
       FROM notifications
      WHERE company_id = ?
        AND COALESCE(recipient_user_id, user_id) = ?
        AND status = 'unread'
        AND (expires_at IS NULL OR expires_at > ?)`,
    [companyId, userId, new Date().toISOString()],
  );

export const getPreferences = (env: Env, companyId: string, userId: string) =>
  many<NotificationPreference>(
    env,
    "SELECT * FROM notification_preferences WHERE company_id = ? AND user_id = ? ORDER BY category",
    [companyId, userId],
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
    timestamp: string;
  },
) =>
  run(
    env,
    `INSERT INTO notification_preferences (
      id, company_id, user_id, category, enabled, minimum_priority, muted_until, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, user_id, category) DO UPDATE SET
      enabled = excluded.enabled,
      minimum_priority = excluded.minimum_priority,
      muted_until = excluded.muted_until,
      updated_at = excluded.updated_at`,
    [
      input.id,
      input.companyId,
      input.userId,
      input.category,
      input.enabled,
      input.minimumPriority,
      input.mutedUntil ?? null,
      input.timestamp,
      input.timestamp,
    ],
  );

export const preferenceForCategory = (env: Env, companyId: string, userId: string, category: string) =>
  one<NotificationPreference>(
    env,
    "SELECT * FROM notification_preferences WHERE company_id = ? AND user_id = ? AND category = ? LIMIT 1",
    [companyId, userId, category],
  );

export const logDelivery = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    notificationId?: string | null;
    recipientUserId?: string | null;
    eventKey?: string | null;
    status: "created" | "skipped_preference" | "duplicate" | "failed";
    failureReason?: string | null;
    metadataJson?: string | null;
    createdAt: string;
  },
) =>
  run(
    env,
    `INSERT INTO notification_delivery_logs (
      id, company_id, notification_id, recipient_user_id, event_key, status,
      failure_reason, created_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.notificationId ?? null,
      input.recipientUserId ?? null,
      input.eventKey ?? null,
      input.status,
      input.failureReason ?? null,
      input.createdAt,
      input.metadataJson ?? null,
    ],
  );

export const findActiveUsersByIds = (env: Env, companyId: string, ids: string[]) => {
  if (ids.length === 0) return Promise.resolve([]);
  const placeholders = ids.map(() => "?").join(", ");
  return many<{ id: string; employee_id: string | null; outlet_id?: string | null }>(
    env,
    `SELECT u.id, u.employee_id, e.primary_outlet_id AS outlet_id
       FROM users u
       LEFT JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
      WHERE u.company_id = ? AND u.id IN (${placeholders}) AND u.status = 'active' AND u.deleted_at IS NULL`,
    [companyId, ...ids],
  );
};

export const findActiveUsersByEmployeeIds = (env: Env, companyId: string, employeeIds: string[]) => {
  if (employeeIds.length === 0) return Promise.resolve([]);
  const placeholders = employeeIds.map(() => "?").join(", ");
  return many<{ id: string; employee_id: string | null; outlet_id?: string | null }>(
    env,
    `SELECT u.id, u.employee_id, e.primary_outlet_id AS outlet_id
       FROM users u
       LEFT JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
      WHERE u.company_id = ? AND u.employee_id IN (${placeholders}) AND u.status = 'active' AND u.deleted_at IS NULL`,
    [companyId, ...employeeIds],
  );
};

export const findActiveUsersByRoleKeys = (env: Env, companyId: string, roleKeys: string[], outletId?: string | null) => {
  if (roleKeys.length === 0) return Promise.resolve([]);
  const placeholders = roleKeys.map(() => "?").join(", ");
  const outletJoin = outletId
    ? "AND (NOT EXISTS (SELECT 1 FROM user_outlets uo_any WHERE uo_any.company_id = u.company_id AND uo_any.user_id = u.id) OR EXISTS (SELECT 1 FROM user_outlets uo WHERE uo.company_id = u.company_id AND uo.user_id = u.id AND uo.outlet_id = ? AND (uo.ends_at IS NULL OR uo.ends_at > CURRENT_TIMESTAMP)))"
    : "";
  return many<{ id: string; employee_id: string | null; role_key: string }>(
    env,
    `SELECT DISTINCT u.id, u.employee_id, r.role_key
       FROM users u
       JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
       JOIN roles r ON r.company_id = ur.company_id AND r.id = ur.role_id
      WHERE u.company_id = ? AND u.status = 'active' AND u.deleted_at IS NULL
        AND r.is_active = 1 AND r.role_key IN (${placeholders})
        ${outletJoin}`,
    outletId ? [companyId, ...roleKeys, outletId] : [companyId, ...roleKeys],
  );
};

export const findActiveUsersByPermissionKeys = (env: Env, companyId: string, permissionKeys: string[], outletId?: string | null) => {
  if (permissionKeys.length === 0) return Promise.resolve([]);
  const placeholders = permissionKeys.map(() => "?").join(", ");
  const outletJoin = outletId
    ? "AND (NOT EXISTS (SELECT 1 FROM user_outlets uo_any WHERE uo_any.company_id = u.company_id AND uo_any.user_id = u.id) OR EXISTS (SELECT 1 FROM user_outlets uo WHERE uo.company_id = u.company_id AND uo.user_id = u.id AND uo.outlet_id = ? AND (uo.ends_at IS NULL OR uo.ends_at > CURRENT_TIMESTAMP)))"
    : "";
  return many<{ id: string; employee_id: string | null; permission_key: string }>(
    env,
    `SELECT DISTINCT u.id, u.employee_id, rp.permission_key
       FROM users u
       JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
       JOIN role_permissions rp ON rp.company_id = ur.company_id AND rp.role_id = ur.role_id
      WHERE u.company_id = ? AND u.status = 'active' AND u.deleted_at IS NULL
        AND rp.permission_key IN (${placeholders})
        ${outletJoin}
      UNION
      SELECT DISTINCT u.id, u.employee_id, up.permission_key
       FROM users u
       JOIN user_permission_overrides up ON up.company_id = u.company_id AND up.user_id = u.id
      WHERE u.company_id = ? AND u.status = 'active' AND u.deleted_at IS NULL
        AND up.is_allowed = 1 AND up.permission_key IN (${placeholders})
        ${outletJoin}`,
    outletId
      ? [companyId, ...permissionKeys, outletId, companyId, ...permissionKeys, outletId]
      : [companyId, ...permissionKeys, companyId, ...permissionKeys],
  );
};
