export type NotificationStatus = "unread" | "read" | "archived" | "dismissed";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type NotificationCategory =
  | "leave"
  | "long_leave"
  | "attendance"
  | "biometric"
  | "roster"
  | "holiday"
  | "payroll"
  | "documents"
  | "system"
  | "approvals"
  | "security";

export interface NotificationRecord {
  id: string;
  company_id: string;
  user_id?: string | null;
  recipient_user_id: string | null;
  recipient_employee_id: string | null;
  recipient_role_key: string | null;
  recipient_permission_key: string | null;
  outlet_id: string | null;
  department_id: string | null;
  notification_type: string;
  category: NotificationCategory | string;
  priority: NotificationPriority | string;
  title: string;
  message: string | null;
  action_url: string | null;
  action_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  event_key: string | null;
  idempotency_key: string | null;
  status: NotificationStatus | string;
  is_read?: number | null;
  read_at: string | null;
  archived_at: string | null;
  dismissed_at: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  metadata_json: string | null;
  updated_at: string | null;
}

export interface NotificationPayload {
  notification_type: string;
  category: NotificationCategory | string;
  priority?: NotificationPriority;
  title: string;
  message?: string | null;
  action_url?: string | null;
  action_label?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  event_key?: string | null;
  idempotency_key?: string | null;
  outlet_id?: string | null;
  department_id?: string | null;
  recipient_employee_id?: string | null;
  recipient_role_key?: string | null;
  recipient_permission_key?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationRecipient {
  user_id: string;
  employee_id?: string | null;
  role_key?: string | null;
  permission_key?: string | null;
}

export interface RecipientResolveInput {
  userIds?: string[];
  employeeIds?: string[];
  roleKeys?: string[];
  permissionKeys?: string[];
  outletId?: string | null;
  departmentId?: string | null;
  excludeUserId?: string | null;
  fallbackToAdmins?: boolean;
}

export interface NotificationListFilters {
  status?: string;
  category?: string;
  priority?: string;
  notification_type?: string;
  entity_type?: string;
  entity_id?: string;
  from_date?: string;
  to_date?: string;
  unread_only?: boolean;
  include_archived?: boolean;
  page: number;
  page_size: number;
}

export interface NotificationPreference {
  id: string;
  company_id: string;
  user_id: string;
  category: string;
  enabled: number;
  minimum_priority: NotificationPriority | string;
  muted_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferenceInput {
  category: string;
  enabled: boolean;
  minimum_priority?: NotificationPriority;
  muted_until?: string | null;
}
