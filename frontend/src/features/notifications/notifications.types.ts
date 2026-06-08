export type NotificationStatus = "unread" | "read" | "archived" | "dismissed";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface NotificationRecord {
  id: string;
  title: string;
  message?: string | null;
  category: string;
  priority: NotificationPriority | string;
  notification_type: string;
  status: NotificationStatus | string;
  action_url?: string | null;
  action_label?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  created_at: string;
  read_at?: string | null;
  archived_at?: string | null;
  dismissed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationFilters {
  status?: string;
  category?: string;
  priority?: string;
  unread_only?: boolean;
  include_archived?: boolean;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}

export interface NotificationCount {
  unread_count: number;
  urgent_count?: number;
}

export interface NotificationPreference {
  id?: string;
  category: string;
  enabled: number | boolean;
  minimum_priority: NotificationPriority | string;
  muted_until?: string | null;
}
