import * as repository from "./email-notifications.repository";
import { getEmailProvider, getEmailProviderStatus } from "./email-provider";
import { codeEmailTemplates, renderEmailTemplate, templateForKey } from "./email-templates";
import type {
  CreateEmailJobInput,
  EmailListFilters,
  EmailNotificationRecord,
  EmailPreferenceInput,
  EmailSettingsInput,
} from "./email-notifications.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import { sanitizeActionUrl, sanitizeFailureMessage, sanitizeNotificationMetadata } from "../notifications/notification-safety";
import {
  filterByEnabledCategories,
  getEnabledNotificationCategories,
  isNotificationPayloadModuleEnabled,
} from "../notifications/module-aware-alerts";

const nowIso = () => new Date().toISOString();
const priorityRank: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
const criticalCategories = new Set(["security", "system"]);
const defaultCategories = ["leave", "long_leave", "attendance", "biometric", "roster", "holiday", "payroll", "documents", "contracts", "assets", "uniforms", "system", "approvals", "security", "backup"];

const pagination = (filters: EmailListFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / filters.page_size),
});

const boolEnv = (value?: string) => ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());

const parseCategories = (value?: string | null) => {
  if (!value) return defaultCategories;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : defaultCategories;
  } catch {
    return defaultCategories;
  }
};

const safeEmailJob = (row: EmailNotificationRecord) => {
  const { metadata_json, ...safe } = row;
  let metadata: Record<string, unknown> | null = null;
  if (metadata_json) {
    try {
      metadata = sanitizeNotificationMetadata(JSON.parse(metadata_json));
    } catch {
      metadata = null;
    }
  }
  return { ...safe, metadata };
};

export const getEffectiveEmailSettings = async (env: Env, companyId: string) => {
  const row = await repository.getSettings(env, companyId).catch(() => null);
  const providerStatus = getEmailProviderStatus(env);
  const envEnabled = boolEnv(env.EMAIL_NOTIFICATIONS_ENABLED);
  const enabledCategories = await getEnabledNotificationCategories(env, companyId);
  return {
    enabled: row ? row.enabled === 1 : envEnabled,
    provider_name: row?.provider_name ?? providerStatus.provider,
    allowed_categories: parseCategories(row?.allowed_categories_json).filter((category) => enabledCategories.has(category)),
    minimum_priority: row?.minimum_priority ?? "normal",
    send_immediately: row ? row.send_immediately === 1 : false,
    admin_failure_notifications: row ? row.admin_failure_notifications === 1 : false,
    provider_status: providerStatus,
    dry_run: providerStatus.dry_run,
    updated_reason: row?.updated_reason ?? null,
  };
};

const shouldSkipForSettings = async (env: Env, companyId: string, category: string, priority: string) => {
  const settings = await getEffectiveEmailSettings(env, companyId);
  if (!settings.enabled) return { skip: true, status: "skipped_disabled", reason: "Email notifications are disabled." };
  if (!settings.allowed_categories.includes(category)) return { skip: true, status: "skipped_disabled", reason: "Email category is disabled." };
  if (priorityRank[priority] < priorityRank[settings.minimum_priority]) {
    return { skip: true, status: "skipped_preference", reason: "Email priority is below company minimum." };
  }
  if (!settings.provider_status.configured && !settings.dry_run) {
    return { skip: true, status: "skipped_config_missing", reason: settings.provider_status.reason ?? "Email provider configuration is missing." };
  }
  return { skip: false, settings };
};

const shouldSkipForPreference = async (
  env: Env,
  companyId: string,
  userId: string | null | undefined,
  category: string,
  priority: string,
  optional: boolean,
) => {
  if (!userId || !optional || criticalCategories.has(category)) return false;
  const preference = await repository.preferenceForCategory(env, companyId, userId, category).catch(() => null);
  if (!preference) return false;
  if (preference.email_enabled === 0) return true;
  if (preference.muted_until && preference.muted_until > nowIso()) return true;
  return priorityRank[priority] < priorityRank[preference.minimum_priority_for_email ?? "normal"];
};

const renderPayload = (input: CreateEmailJobInput) => {
  const payload = input.payload;
  const templateKey = payload.template_key ?? payload.notification_type ?? "generic_notification";
  const template = templateForKey(templateKey) ?? templateForKey("generic_notification")!;
  const variables = {
    title: payload.title,
    message: payload.message ?? payload.title,
    action_url: sanitizeActionUrl(payload.action_url) ?? "",
    status: "",
    ...payload.metadata,
    ...payload.template_variables,
  };
  const rendered = renderEmailTemplate(template, variables);
  return {
    ...rendered,
    subject: (payload.subject ?? rendered.subject).slice(0, 180),
    text: rendered.text,
    html: rendered.html,
  };
};

export const createEmailJob = async (env: Env, companyId: string, input: CreateEmailJobInput) => {
  const timestamp = input.createdAt ?? nowIso();
  const priority = input.payload.priority ?? "normal";
  const moduleCheck = await isNotificationPayloadModuleEnabled(env, companyId, input.payload);
  if (!moduleCheck.enabled) {
    return { job: null, duplicate: false, skipped_disabled_module: true, reason: moduleCheck.reason };
  }
  const idempotencyKey = input.payload.idempotency_key
    ? `${input.payload.idempotency_key}:email:${input.recipientUserId ?? input.recipientEmail ?? "unknown"}`
    : null;
  if (idempotencyKey) {
    const existing = await repository.findEmailJobByIdempotencyKey(env, companyId, idempotencyKey);
    if (existing) {
      await repository.logDelivery(env, {
        id: createPrefixedId("email_delivery"),
        companyId,
        emailNotificationId: existing.id,
        status: "duplicate",
        provider: existing.provider,
        createdAt: timestamp,
      }).catch(() => undefined);
      return { job: safeEmailJob(existing), duplicate: true };
    }
  }

  const user = input.recipientUserId ? await repository.findUserEmail(env, companyId, input.recipientUserId).catch(() => null) : null;
  const recipientEmail = (input.recipientEmail ?? user?.email ?? "").trim().toLowerCase();
  const recipientName = input.recipientName ?? user?.full_name ?? null;
  const settingsSkip = await shouldSkipForSettings(env, companyId, input.payload.category, priority);
  const preferenceSkip = await shouldSkipForPreference(env, companyId, input.recipientUserId, input.payload.category, priority, input.optional ?? true);
  const status: string = !recipientEmail
    ? "skipped_no_email"
    : preferenceSkip
      ? "skipped_preference"
      : settingsSkip.skip
        ? settingsSkip.status ?? "skipped_config_missing"
        : "pending";
  const failureCode = status.startsWith("skipped_") ? status.toUpperCase() : null;
  const failureMessage = !recipientEmail
    ? "Recipient does not have an email address."
    : preferenceSkip
      ? "Recipient email preference disabled this optional notification."
      : settingsSkip.skip
        ? settingsSkip.reason
        : null;
  const rendered = renderPayload(input);
  const metadata = sanitizeNotificationMetadata({
    ...input.payload.metadata,
    in_app_notification_id: input.inAppNotificationId,
  });
  const id = createPrefixedId("email_notif");
  await repository.createEmailJob(env, {
    id,
    companyId,
    inAppNotificationId: input.inAppNotificationId ?? null,
    recipientUserId: input.recipientUserId ?? null,
    recipientEmployeeId: input.recipientEmployeeId ?? user?.employee_id ?? null,
    recipientEmail: recipientEmail || null,
    recipientName,
    notificationType: input.payload.notification_type,
    category: input.payload.category,
    priority,
    subject: rendered.subject,
    textBody: rendered.text,
    htmlBody: rendered.html,
    templateKey: rendered.template_key,
    templateVersion: rendered.template_version,
    entityType: input.payload.entity_type ?? null,
    entityId: input.payload.entity_id ?? null,
    eventKey: input.payload.event_key ?? null,
    idempotencyKey,
    status,
    provider: getEmailProviderStatus(env).provider,
    failureCode,
    failureMessage,
    createdBy: input.actorId ?? null,
    createdAt: timestamp,
    metadataJson: metadata ? JSON.stringify(metadata) : null,
  });
  const created = await repository.getEmailJob(env, companyId, id);
  await repository.logDelivery(env, {
    id: createPrefixedId("email_delivery"),
    companyId,
    emailNotificationId: id,
    status: status === "pending" ? "created" : status,
    provider: getEmailProviderStatus(env).provider,
    failureCode,
    failureMessage,
    createdAt: timestamp,
  }).catch(() => undefined);
  return { job: created ? safeEmailJob(created) : null, duplicate: false };
};

export const safeCreateEmailJobForNotification = async (env: Env, companyId: string, input: CreateEmailJobInput) => {
  try {
    return await createEmailJob(env, companyId, input);
  } catch (error) {
    console.error("Email notification hook failed", {
      eventKey: input.payload.event_key,
      entityType: input.payload.entity_type,
      entityId: input.payload.entity_id,
      error,
    });
    await createAuditLog(env, {
      companyId,
      module: "email_notifications",
      action: "email_job_creation_failed",
      severity: "warning",
      entityType: input.payload.entity_type ?? "email_notification",
      entityId: input.payload.entity_id ?? input.payload.event_key ?? "unknown",
      actorId: input.actorId ?? undefined,
      details: { event_key: input.payload.event_key, category: input.payload.category },
    }).catch(() => undefined);
    return { job: null, failed: true };
  }
};

export const listEmailJobs = async (env: Env, context: AuthActor, filters: EmailListFilters) => {
  const enabledCategories = await getEnabledNotificationCategories(env, context.companyId, context);
  if (filters.category && !enabledCategories.has(filters.category)) {
    return { rows: [], pagination: pagination(filters, 0) };
  }
  const scopedFilters = permissionService.hasAnyPermission(context, ["email_notifications.admin.view", "email_notifications.admin.manage"])
    ? { ...filters, categories: [...enabledCategories] }
    : { ...filters, categories: [...enabledCategories], recipient_user_id: context.actorUserId };
  const total = await repository.countEmailJobs(env, context.companyId, scopedFilters);
  return {
    rows: (await repository.listEmailJobs(env, context.companyId, scopedFilters)).map(safeEmailJob),
    pagination: pagination(scopedFilters, total),
  };
};

export const getEmailJob = async (env: Env, context: AuthActor, id: string) => {
  const row = await repository.getEmailJob(env, context.companyId, id);
  if (!row) throw new NotFoundError("Email notification could not be found.");
  if (row.recipient_user_id !== context.actorUserId && !permissionService.hasAnyPermission(context, ["email_notifications.admin.view", "email_notifications.admin.manage"])) {
    throw new PermissionError("You do not have permission to view this email notification.", "EMAIL_NOTIFICATION_PERMISSION_DENIED");
  }
  return { email_notification: safeEmailJob(row) };
};

export const sendPendingEmail = async (env: Env, context: AuthActor, id: string) => {
  const row = await repository.getEmailJob(env, context.companyId, id);
  if (!row) throw new NotFoundError("Email notification could not be found.");
  if (row.status === "sent") throw new AppError("This email has already been sent.", "EMAIL_ALREADY_SENT", 409);
  if (!["pending", "queued", "failed"].includes(row.status)) {
    throw new AppError("This email cannot be retried from its current status.", "EMAIL_RETRY_NOT_ALLOWED", 409);
  }
  if (!row.recipient_email) {
    await repository.markFailed(env, {
      companyId: context.companyId,
      id,
      status: "skipped_no_email",
      failureCode: "EMAIL_RECIPIENT_MISSING_EMAIL",
      failureMessage: "Recipient does not have an email address.",
      timestamp: nowIso(),
    });
    throw new AppError("The recipient does not have an email address.", "EMAIL_RECIPIENT_MISSING_EMAIL", 400);
  }
  const timestamp = nowIso();
  const provider = getEmailProvider(env);
  const validation = provider.validateConfiguration();
  if (!validation.ok) {
    await repository.markFailed(env, {
      companyId: context.companyId,
      id,
      status: "skipped_config_missing",
      failureCode: "EMAIL_NOT_CONFIGURED",
      failureMessage: validation.reason ?? "Email provider is not configured.",
      provider: provider.getProviderName(),
      timestamp,
    });
    return { email_notification: safeEmailJob((await repository.getEmailJob(env, context.companyId, id))!), sent: false };
  }
  await repository.updateAttempt(env, context.companyId, id, timestamp);
  try {
    const result = await provider.sendEmail({
      to: row.recipient_email,
      subject: row.subject,
      text: row.text_body,
      html: row.html_body,
      from: env.EMAIL_FROM_ADDRESS,
      fromName: env.EMAIL_FROM_NAME,
      replyTo: env.EMAIL_REPLY_TO,
    });
    await repository.markSent(env, {
      companyId: context.companyId,
      id,
      provider: result.provider,
      providerMessageId: result.providerMessageId ?? null,
      timestamp: nowIso(),
    });
    await repository.logDelivery(env, {
      id: createPrefixedId("email_delivery"),
      companyId: context.companyId,
      emailNotificationId: id,
      status: "sent",
      provider: result.provider,
      createdAt: nowIso(),
      metadataJson: JSON.stringify({ dry_run: Boolean(result.dryRun) }),
    }).catch(() => undefined);
    return { email_notification: safeEmailJob((await repository.getEmailJob(env, context.companyId, id))!), sent: true };
  } catch (error) {
    const message = sanitizeFailureMessage(error);
    await repository.markFailed(env, {
      companyId: context.companyId,
      id,
      failureCode: "EMAIL_SEND_FAILED",
      failureMessage: message,
      provider: provider.getProviderName(),
      timestamp: nowIso(),
    });
    await repository.logDelivery(env, {
      id: createPrefixedId("email_delivery"),
      companyId: context.companyId,
      emailNotificationId: id,
      status: "failed",
      provider: provider.getProviderName(),
      failureCode: "EMAIL_SEND_FAILED",
      failureMessage: message,
      createdAt: nowIso(),
    }).catch(() => undefined);
    throw new AppError("Email could not be sent. The job remains retryable.", "EMAIL_SEND_FAILED", 502);
  }
};

export const processPendingEmails = async (env: Env, context: AuthActor, limit = 10) => {
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const rows = await repository.listPendingEmailJobs(env, context.companyId, safeLimit);
  const results = [];
  for (const row of rows) {
    try {
      results.push(await sendPendingEmail(env, context, row.id));
    } catch (error) {
      results.push({ id: row.id, sent: false, error: sanitizeFailureMessage(error) });
    }
  }
  return { processed: rows.length, results };
};

export const getPreferences = async (env: Env, context: AuthActor) => ({
  preferences: filterByEnabledCategories(
    await repository.getPreferences(env, context.companyId, context.actorUserId),
    await getEnabledNotificationCategories(env, context.companyId, context),
  ),
});

export const updatePreferences = async (env: Env, context: AuthActor, preferences: EmailPreferenceInput[]) => {
  const timestamp = nowIso();
  const enabledCategories = await getEnabledNotificationCategories(env, context.companyId, context);
  for (const preference of preferences) {
    if (criticalCategories.has(preference.category) && preference.email_enabled === false) {
      throw new AppError("Critical system and security emails cannot be fully disabled.", "EMAIL_PREFERENCE_INVALID", 400);
    }
    if (!enabledCategories.has(preference.category)) {
      throw new AppError("This email notification category is disabled because its module is disabled.", "EMAIL_CATEGORY_DISABLED", 400);
    }
    await repository.upsertPreference(env, {
      id: createPrefixedId("email_pref"),
      companyId: context.companyId,
      userId: context.actorUserId,
      category: preference.category,
      enabled: preference.email_enabled ? 1 : 0,
      minimumPriority: preference.minimum_priority_for_email ?? "normal",
      mutedUntil: preference.muted_until ?? null,
      digestEnabled: preference.digest_enabled ? 1 : 0,
      timestamp,
    });
  }
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "email_notifications",
    action: "email_preferences_updated",
    entityType: "email_notification_preferences",
    entityId: context.actorUserId,
    actorId: context.actorUserId,
    details: { categories: preferences.map((preference) => preference.category) },
    requestId: context.requestId,
  }).catch(() => undefined);
  return getPreferences(env, context);
};

export const getSettings = async (env: Env, context: AuthActor) => ({
  settings: await getEffectiveEmailSettings(env, context.companyId),
});

export const updateSettings = async (env: Env, context: AuthActor, input: EmailSettingsInput) => {
  if (!input.reason?.trim()) throw new ValidationError("A reason is required to update email notification settings.");
  const current = await getEffectiveEmailSettings(env, context.companyId);
  const enabledCategories = await getEnabledNotificationCategories(env, context.companyId, context);
  const timestamp = nowIso();
  await repository.upsertSettings(env, {
    id: createPrefixedId("email_settings"),
    companyId: context.companyId,
    enabled: (input.enabled ?? current.enabled) ? 1 : 0,
    providerName: getEmailProviderStatus(env).provider,
    allowedCategoriesJson: JSON.stringify((input.allowed_categories ?? current.allowed_categories).filter((category) => enabledCategories.has(category))),
    minimumPriority: input.minimum_priority ?? current.minimum_priority,
    sendImmediately: (input.send_immediately ?? current.send_immediately) ? 1 : 0,
    adminFailureNotifications: (input.admin_failure_notifications ?? current.admin_failure_notifications) ? 1 : 0,
    updatedBy: context.actorUserId,
    reason: input.reason,
    timestamp,
  });
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "email_notifications",
    action: "email_settings_updated",
    entityType: "email_notification_settings",
    entityId: context.companyId,
    actorId: context.actorUserId,
    details: { reason: input.reason, enabled: input.enabled, minimum_priority: input.minimum_priority },
    requestId: context.requestId,
  }).catch(() => undefined);
  return getSettings(env, context);
};

export const listTemplates = async () => ({ templates: codeEmailTemplates });

export const previewTemplate = async (_env: Env, _context: AuthActor, templateKey: string, variables: Record<string, unknown> = {}) => {
  const template = templateForKey(templateKey);
  if (!template) throw new NotFoundError("Email template could not be found.");
  return { preview: renderEmailTemplate(template, variables), template };
};
