import type { NotificationCategory, NotificationPayload, NotificationPriority } from "../notifications/notifications.types";

export type EmailStatus =
  | "pending"
  | "queued"
  | "sent"
  | "failed"
  | "skipped_preference"
  | "skipped_no_email"
  | "skipped_disabled"
  | "skipped_config_missing"
  | "duplicate";

export interface EmailNotificationRecord {
  id: string;
  company_id: string;
  in_app_notification_id: string | null;
  recipient_user_id: string | null;
  recipient_employee_id: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  notification_type: string;
  category: NotificationCategory | string;
  priority: NotificationPriority | string;
  subject: string;
  text_body: string;
  html_body: string | null;
  template_key: string | null;
  template_version: string | null;
  entity_type: string | null;
  entity_id: string | null;
  event_key: string | null;
  idempotency_key: string | null;
  status: EmailStatus | string;
  provider: string | null;
  provider_message_id: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

export interface EmailPreference {
  id: string;
  company_id: string;
  user_id: string;
  category: string;
  email_enabled: number;
  minimum_priority_for_email: NotificationPriority | string;
  muted_until: string | null;
  digest_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface EmailPreferenceInput {
  category: string;
  email_enabled: boolean;
  minimum_priority_for_email?: NotificationPriority;
  muted_until?: string | null;
  digest_enabled?: boolean;
}

export interface EmailSettingsRecord {
  id: string;
  company_id: string;
  enabled: number;
  provider_name: string | null;
  allowed_categories_json: string | null;
  minimum_priority: NotificationPriority | string;
  send_immediately: number;
  admin_failure_notifications: number;
  updated_by: string | null;
  updated_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailSettingsInput {
  enabled?: boolean;
  allowed_categories?: string[];
  minimum_priority?: NotificationPriority;
  send_immediately?: boolean;
  admin_failure_notifications?: boolean;
  reason: string;
}

export interface EmailListFilters {
  status?: string;
  category?: string;
  categories?: string[];
  priority?: string;
  notification_type?: string;
  recipient_user_id?: string;
  entity_type?: string;
  entity_id?: string;
  from_date?: string;
  to_date?: string;
  page: number;
  page_size: number;
}

export interface EmailJobPayload extends NotificationPayload {
  subject?: string | null;
  template_key?: string | null;
  template_variables?: Record<string, unknown> | null;
}

export interface CreateEmailJobInput {
  inAppNotificationId?: string | null;
  recipientUserId?: string | null;
  recipientEmployeeId?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  payload: EmailJobPayload;
  actorId?: string | null;
  optional?: boolean;
  createdAt?: string;
}

export interface EmailTemplateDefinition {
  template_key: string;
  template_name: string;
  category: string;
  version: string;
  subject_template: string;
  text_template: string;
  html_template?: string | null;
}

export interface EmailProviderMessage {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  from?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
}

export interface EmailProviderResult {
  provider: string;
  providerMessageId?: string | null;
  dryRun?: boolean;
}
