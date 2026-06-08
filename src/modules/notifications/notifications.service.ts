import * as repository from "./notifications.repository";
import type {
  NotificationListFilters,
  NotificationPayload,
  NotificationPreferenceInput,
  NotificationRecipient,
  RecipientResolveInput,
} from "./notifications.types";
import { sanitizeActionUrl, sanitizeNotificationMetadata } from "./notification-safety";
import { safeCreateEmailJobForNotification } from "../email-notifications/email-notifications.service";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
const priorityRank: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
const criticalCategories = new Set(["security", "system"]);

const pagination = (filters: NotificationListFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / filters.page_size),
});

const safeNotification = (row: any) => {
  const {
    metadata_json,
    api_token_hash: _apiTokenHash,
    device_token_hash: _deviceTokenHash,
    password_hash: _passwordHash,
    ...safe
  } = row;
  let metadata: Record<string, unknown> | null = null;
  if (metadata_json) {
    try {
      metadata = sanitizeNotificationMetadata(JSON.parse(metadata_json));
    } catch {
      metadata = null;
    }
  }
  return {
    ...safe,
    metadata,
  };
};

const shouldSkipForPreference = async (
  env: Env,
  companyId: string,
  userId: string,
  payload: NotificationPayload,
  optional: boolean,
) => {
  if (!optional || criticalCategories.has(payload.category)) return false;
  const preference = await repository.preferenceForCategory(env, companyId, userId, payload.category).catch(() => null);
  if (!preference) return false;
  if (preference.enabled === 0) return true;
  if (preference.muted_until && preference.muted_until > nowIso()) return true;
  return priorityRank[payload.priority ?? "normal"] < priorityRank[preference.minimum_priority ?? "low"];
};

export const resolveRecipients = async (
  env: Env,
  companyId: string,
  input: RecipientResolveInput,
): Promise<NotificationRecipient[]> => {
  const seen = new Map<string, NotificationRecipient>();
  const add = (recipient: NotificationRecipient) => {
    if (!recipient.user_id || recipient.user_id === input.excludeUserId) return;
    seen.set(recipient.user_id, { ...seen.get(recipient.user_id), ...recipient });
  };

  for (const row of await repository.findActiveUsersByIds(env, companyId, input.userIds ?? [])) {
    add({ user_id: row.id, employee_id: row.employee_id });
  }
  for (const row of await repository.findActiveUsersByEmployeeIds(env, companyId, input.employeeIds ?? [])) {
    add({ user_id: row.id, employee_id: row.employee_id });
  }
  for (const row of await repository.findActiveUsersByRoleKeys(env, companyId, input.roleKeys ?? [], input.outletId)) {
    add({ user_id: row.id, employee_id: row.employee_id, role_key: row.role_key });
  }
  for (const row of await repository.findActiveUsersByPermissionKeys(env, companyId, input.permissionKeys ?? [], input.outletId)) {
    add({ user_id: row.id, employee_id: row.employee_id, permission_key: row.permission_key });
  }
  if (seen.size === 0 && input.fallbackToAdmins) {
    for (const row of await repository.findActiveUsersByRoleKeys(env, companyId, ["super_admin", "admin"], input.outletId)) {
      add({ user_id: row.id, employee_id: row.employee_id, role_key: row.role_key });
    }
  }
  return [...seen.values()];
};

export const createNotificationsForUsers = async (
  env: Env,
  companyId: string,
  userIds: string[],
  payload: NotificationPayload,
  options: { actorId?: string | null; optional?: boolean; excludeActor?: boolean } = {},
) => {
  const recipients = await resolveRecipients(env, companyId, {
    userIds,
    excludeUserId: options.excludeActor ? options.actorId : null,
  });
  const created = [];
  let createdCount = 0;
  let duplicateCount = 0;
  const timestamp = nowIso();
  for (const recipient of recipients) {
    const idempotencyKey = payload.idempotency_key
      ? `${payload.idempotency_key}:user:${recipient.user_id}`
      : null;
    if (idempotencyKey) {
      const existing = await repository.findNotificationByIdempotencyKey(env, companyId, idempotencyKey);
      if (existing) {
        await repository.logDelivery(env, {
          id: createPrefixedId("notif_delivery"),
          companyId,
          notificationId: existing.id,
          recipientUserId: recipient.user_id,
          eventKey: payload.event_key ?? null,
          status: "duplicate",
          createdAt: timestamp,
        }).catch(() => undefined);
        created.push(safeNotification(existing));
        duplicateCount += 1;
        continue;
      }
    }
    if (await shouldSkipForPreference(env, companyId, recipient.user_id, payload, options.optional ?? true)) {
      await repository.logDelivery(env, {
        id: createPrefixedId("notif_delivery"),
        companyId,
        recipientUserId: recipient.user_id,
        eventKey: payload.event_key ?? null,
        status: "skipped_preference",
        createdAt: timestamp,
      }).catch(() => undefined);
      continue;
    }
    const id = createPrefixedId("notif");
    const metadata = sanitizeNotificationMetadata(payload.metadata);
    await repository.createNotification(env, {
      ...payload,
      id,
      companyId,
      recipientUserId: recipient.user_id,
      recipient_employee_id: payload.recipient_employee_id ?? recipient.employee_id ?? null,
      recipient_role_key: payload.recipient_role_key ?? recipient.role_key ?? null,
      recipient_permission_key: payload.recipient_permission_key ?? recipient.permission_key ?? null,
      idempotency_key: idempotencyKey,
      action_url: sanitizeActionUrl(payload.action_url),
      createdBy: options.actorId ?? null,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
      createdAt: timestamp,
    });
    const row = await repository.getNotificationForUser(env, companyId, recipient.user_id, id);
    if (row) created.push(safeNotification(row));
    createdCount += 1;
    await repository.logDelivery(env, {
      id: createPrefixedId("notif_delivery"),
      companyId,
      notificationId: id,
      recipientUserId: recipient.user_id,
      eventKey: payload.event_key ?? null,
      status: "created",
      createdAt: timestamp,
    }).catch(() => undefined);
    if (String(env.EMAIL_NOTIFICATIONS_ENABLED ?? "").toLowerCase() === "true" && metadata?.email_disabled !== true) {
      await safeCreateEmailJobForNotification(env, companyId, {
        inAppNotificationId: id,
        recipientUserId: recipient.user_id,
        recipientEmployeeId: payload.recipient_employee_id ?? recipient.employee_id ?? null,
        payload,
        actorId: options.actorId ?? null,
        optional: options.optional ?? true,
        createdAt: timestamp,
      }).catch(() => undefined);
    }
  }
  return { created_count: createdCount, duplicate_count: duplicateCount, notifications: created };
};

export const createNotification = async (
  env: Env,
  companyIdOrInput: string | { recipientId: string; title: string; message: string; category?: string; metadata?: Record<string, unknown> },
  recipientOrPayload?: NotificationRecipient | NotificationPayload,
  payloadOrOptions?: NotificationPayload | { actorId?: string | null },
  maybeOptions: { actorId?: string | null; optional?: boolean; excludeActor?: boolean } = {},
) => {
  if (typeof companyIdOrInput !== "string") {
    return {
      queued: false,
      message: "Legacy notification input is no longer queued without company context.",
    };
  }
  const recipient = recipientOrPayload as NotificationRecipient;
  const payload = payloadOrOptions as NotificationPayload;
  return createNotificationsForUsers(env, companyIdOrInput, [recipient.user_id], payload, maybeOptions);
};

export const notifyResolvedRecipients = async (
  env: Env,
  companyId: string,
  resolve: RecipientResolveInput,
  payload: NotificationPayload,
  options: { actorId?: string | null; optional?: boolean; excludeActor?: boolean } = {},
) => {
  const recipients = await resolveRecipients(env, companyId, {
    ...resolve,
    excludeUserId: options.excludeActor ? options.actorId : resolve.excludeUserId,
  });
  return createNotificationsForUsers(env, companyId, recipients.map((recipient) => recipient.user_id), payload, {
    actorId: options.actorId,
    optional: options.optional,
  });
};

export const safeNotifyResolvedRecipients = async (
  env: Env,
  companyId: string,
  resolve: RecipientResolveInput,
  payload: NotificationPayload,
  options: { actorId?: string | null; optional?: boolean; excludeActor?: boolean; requestId?: string } = {},
) => {
  try {
    return await notifyResolvedRecipients(env, companyId, resolve, payload, options);
  } catch (error) {
    console.error("In-app notification hook failed", {
      eventKey: payload.event_key,
      entityType: payload.entity_type,
      entityId: payload.entity_id,
      requestId: options.requestId,
      error,
    });
    await createAuditLog(env, {
      companyId,
      module: "notifications",
      action: "notification_delivery_failed",
      severity: "warning",
      entityType: payload.entity_type ?? "notification",
      entityId: payload.entity_id ?? payload.event_key ?? "unknown",
      actorId: options.actorId ?? undefined,
      details: { event_key: payload.event_key, category: payload.category },
      requestId: options.requestId,
    }).catch(() => undefined);
    return { created_count: 0, notifications: [], failed: true };
  }
};

export const notifyRole = (
  env: Env,
  companyId: string,
  roleKey: string,
  payload: NotificationPayload,
  options: { actorId?: string | null; outletId?: string | null; excludeActor?: boolean } = {},
) =>
  notifyResolvedRecipients(env, companyId, {
    roleKeys: [roleKey],
    outletId: options.outletId,
  }, payload, options);

export const notifyPermission = (
  env: Env,
  companyId: string,
  permissionKey: string,
  payload: NotificationPayload,
  options: { actorId?: string | null; outletId?: string | null; excludeActor?: boolean } = {},
) =>
  notifyResolvedRecipients(env, companyId, {
    permissionKeys: [permissionKey],
    outletId: options.outletId,
  }, payload, options);

export const notifyApprovalAssignees = (
  env: Env,
  companyId: string,
  approvalContext: { userIds?: string[]; roleKeys?: string[]; permissionKeys?: string[]; outletId?: string | null },
  payload: NotificationPayload,
  options: { actorId?: string | null; excludeActor?: boolean } = {},
) =>
  notifyResolvedRecipients(env, companyId, {
    userIds: approvalContext.userIds,
    roleKeys: approvalContext.roleKeys,
    permissionKeys: approvalContext.permissionKeys,
    outletId: approvalContext.outletId,
    fallbackToAdmins: true,
  }, payload, options);

export const listNotifications = async (env: Env, context: AuthActor, filters: NotificationListFilters) => {
  const total = await repository.countNotifications(env, context.companyId, context.actorUserId, filters);
  return {
    rows: (await repository.listNotifications(env, context.companyId, context.actorUserId, filters)).map(safeNotification),
    pagination: pagination(filters, total),
  };
};

export const getNotification = async (env: Env, context: AuthActor, id: string) => {
  const row = await repository.getNotificationForUser(env, context.companyId, context.actorUserId, id);
  if (!row) throw new NotFoundError("Notification could not be found.");
  return { notification: safeNotification(row) };
};

export const getUnreadCount = async (env: Env, context: AuthActor) => {
  const row = await repository.unreadCount(env, context.companyId, context.actorUserId);
  return {
    unread_count: Number(row?.unread_count ?? 0),
    urgent_count: Number(row?.urgent_count ?? 0),
  };
};

const mutateStatus = async (env: Env, context: AuthActor, id: string, status: "unread" | "read" | "archived" | "dismissed") => {
  const existing = await repository.getNotificationForUser(env, context.companyId, context.actorUserId, id);
  if (!existing) throw new NotFoundError("Notification could not be found.");
  await repository.updateNotificationStatus(env, context.companyId, context.actorUserId, id, status, nowIso());
  return { notification: safeNotification(await repository.getNotificationForUser(env, context.companyId, context.actorUserId, id)) };
};

export const markRead = (env: Env, context: AuthActor, id: string) => mutateStatus(env, context, id, "read");
export const markUnread = (env: Env, context: AuthActor, id: string) => mutateStatus(env, context, id, "unread");
export const archive = (env: Env, context: AuthActor, id: string) => mutateStatus(env, context, id, "archived");
export const dismiss = (env: Env, context: AuthActor, id: string) => mutateStatus(env, context, id, "dismissed");

export const markAllRead = async (env: Env, context: AuthActor, filters: NotificationListFilters) => {
  await repository.markAllRead(env, context.companyId, context.actorUserId, filters, nowIso());
  return getUnreadCount(env, context);
};

export const getPreferences = async (env: Env, context: AuthActor) => ({
  preferences: await repository.getPreferences(env, context.companyId, context.actorUserId),
});

export const updatePreferences = async (env: Env, context: AuthActor, preferences: NotificationPreferenceInput[]) => {
  const timestamp = nowIso();
  for (const preference of preferences) {
    if (criticalCategories.has(preference.category) && preference.enabled === false) {
      throw new AppError("Critical system and security notifications cannot be fully disabled.", "NOTIFICATION_PREFERENCE_INVALID", 400);
    }
    await repository.upsertPreference(env, {
      id: createPrefixedId("notif_pref"),
      companyId: context.companyId,
      userId: context.actorUserId,
      category: preference.category,
      enabled: preference.enabled ? 1 : 0,
      minimumPriority: preference.minimum_priority ?? "low",
      mutedUntil: preference.muted_until ?? null,
      timestamp,
    });
  }
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "notifications",
    action: "notification_preferences_updated",
    entityType: "notification_preferences",
    entityId: context.actorUserId,
    actorId: context.actorUserId,
    details: { categories: preferences.map((preference) => preference.category) },
    requestId: context.requestId,
  }).catch(() => undefined);
  return getPreferences(env, context);
};

export const assertOwnNotificationPermission = (context: AuthActor, permission: string) => {
  if (!permissionService.hasAnyPermission(context, [permission, "notifications.manage_own", "notifications.view"])) {
    throw new PermissionError("You do not have permission to manage notifications.", "NOTIFICATION_PERMISSION_DENIED");
  }
};

export const validateNotificationPayloadForTests = (payload: NotificationPayload) => {
  if (!payload.title?.trim()) throw new ValidationError("Notification title is required.");
  sanitizeActionUrl(payload.action_url);
  return sanitizeNotificationMetadata(payload.metadata);
};

export { sanitizeActionUrl, sanitizeNotificationMetadata };
