import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { NotificationCount, NotificationFilters, NotificationPreference, NotificationRecord } from "./notifications.types";

export const notificationsApi = {
  list: (filters: NotificationFilters = {}) => api.get<NotificationRecord[]>(`/notifications${buildQueryString(filters)}`),
  unreadCount: () => api.get<NotificationCount>("/notifications/unread-count"),
  get: (id: string) => api.get<{ notification: NotificationRecord }>(`/notifications/${id}`),
  markRead: (id: string) => api.post<{ notification: NotificationRecord }>(`/notifications/${id}/read`),
  markUnread: (id: string) => api.post<{ notification: NotificationRecord }>(`/notifications/${id}/unread`),
  archive: (id: string) => api.post<{ notification: NotificationRecord }>(`/notifications/${id}/archive`),
  dismiss: (id: string) => api.post<{ notification: NotificationRecord }>(`/notifications/${id}/dismiss`),
  markAllRead: (filters: NotificationFilters = {}) => api.post<NotificationCount>(`/notifications/mark-all-read${buildQueryString(filters)}`),
  preferences: () => api.get<{ preferences: NotificationPreference[] }>("/notifications/preferences"),
  updatePreferences: (preferences: NotificationPreference[]) => api.patch<{ preferences: NotificationPreference[] }>("/notifications/preferences", { preferences }),
};
