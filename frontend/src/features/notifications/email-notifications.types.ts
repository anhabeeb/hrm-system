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
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  notification_type: string;
  category: string;
  priority: string;
  subject: string;
  status: EmailStatus | string;
  provider: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  failure_message: string | null;
  created_at: string;
}

export interface EmailNotificationFilters {
  status?: string;
  category?: string;
  priority?: string;
  notification_type?: string;
  recipient_user_id?: string;
  entity_type?: string;
  entity_id?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}

export interface EmailPreference {
  category: string;
  email_enabled: boolean | number;
  minimum_priority_for_email: string;
  muted_until?: string | null;
  digest_enabled?: boolean | number;
}

export interface EmailSettings {
  enabled: boolean;
  provider_name: string;
  allowed_categories: string[];
  minimum_priority: string;
  send_immediately: boolean;
  admin_failure_notifications: boolean;
  provider_status: {
    provider: string;
    configured: boolean;
    status: string;
    dry_run: boolean;
    from_address_configured: boolean;
    reason: string | null;
  };
}

export interface EmailTemplate {
  template_key: string;
  template_name: string;
  category: string;
  version: string;
  subject_template: string;
  text_template: string;
}
