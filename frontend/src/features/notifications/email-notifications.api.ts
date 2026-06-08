import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type {
  EmailNotificationFilters,
  EmailNotificationRecord,
  EmailPreference,
  EmailSettings,
  EmailTemplate,
} from "./email-notifications.types";

export const emailNotificationsApi = {
  list: (filters: EmailNotificationFilters = {}) => api.get<EmailNotificationRecord[]>(`/email-notifications${buildQueryString(filters)}`),
  get: (id: string) => api.get<{ email_notification: EmailNotificationRecord }>(`/email-notifications/${id}`),
  retry: (id: string) => api.post<{ email_notification: EmailNotificationRecord; sent: boolean }>(`/email-notifications/${id}/retry`),
  processPending: (limit = 10) => api.post<{ processed: number }>("/email-notifications/process-pending", { limit }),
  preferences: () => api.get<{ preferences: EmailPreference[] }>("/email-notifications/preferences"),
  updatePreferences: (preferences: EmailPreference[]) => api.patch<{ preferences: EmailPreference[] }>("/email-notifications/preferences", { preferences }),
  settings: () => api.get<{ settings: EmailSettings }>("/email-notifications/settings"),
  updateSettings: (input: Partial<EmailSettings> & { reason: string }) => api.patch<{ settings: EmailSettings }>("/email-notifications/settings", input),
  templates: () => api.get<{ templates: EmailTemplate[] }>("/email-notifications/templates"),
  previewTemplate: (templateKey: string, variables: Record<string, unknown> = {}) =>
    api.post<{ preview: { subject: string; text: string; html: string | null }; template: EmailTemplate }>(`/email-notifications/templates/${templateKey}/preview`, { variables }),
};
