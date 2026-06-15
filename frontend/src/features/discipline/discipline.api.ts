import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { DisciplinaryAction, DisciplinaryActionPayload, DisciplinaryRecord, DisciplinaryTask, DisciplinaryTimeline } from "./discipline.types";

export const disciplineApi = {
  list: (filters: Record<string, unknown> = {}) => api.get<DisciplinaryAction[]>(`/employee-discipline/actions${buildQueryString(filters)}`),
  records: (filters: Record<string, unknown> = {}) => api.get<DisciplinaryRecord[]>(`/employee-discipline/records${buildQueryString(filters)}`),
  record: (id: string) => api.get<{ disciplinary_record: DisciplinaryRecord }>(`/employee-discipline/records/${id}`),
  create: (payload: DisciplinaryActionPayload) => api.post<{ disciplinary_action: DisciplinaryAction }>("/employee-discipline/actions", payload),
  get: (id: string) => api.get<{ disciplinary_action: DisciplinaryAction }>(`/employee-discipline/actions/${id}`),
  submit: (id: string) => api.post<{ disciplinary_action: DisciplinaryAction; already_submitted?: boolean }>(`/employee-discipline/actions/${id}/submit`, {}),
  approve: (id: string, reason: string) => api.post<{ disciplinary_action: DisciplinaryAction }>(`/employee-discipline/actions/${id}/approve`, { reason }),
  reject: (id: string, reason: string) => api.post<{ disciplinary_action: DisciplinaryAction }>(`/employee-discipline/actions/${id}/reject`, { reason }),
  cancel: (id: string, reason: string) => api.post<{ disciplinary_action: DisciplinaryAction }>(`/employee-discipline/actions/${id}/cancel`, { reason }),
  apply: (id: string, reason: string) => api.post<{ disciplinary_action: DisciplinaryAction; applied?: boolean; manual_review_required?: boolean }>(`/employee-discipline/actions/${id}/apply`, { reason }),
  acknowledge: (id: string, reason: string) => api.post<{ disciplinary_action: DisciplinaryAction }>(`/employee-discipline/actions/${id}/acknowledge`, { reason }),
  close: (id: string, reason: string) => api.post<{ disciplinary_action: DisciplinaryAction }>(`/employee-discipline/actions/${id}/close`, { reason }),
  timeline: (id: string) => api.get<DisciplinaryTimeline>(`/employee-discipline/actions/${id}/timeline`),
  items: (id: string) => api.get<{ items: Array<Record<string, unknown>> }>(`/employee-discipline/actions/${id}/items`),
  tasks: (id: string) => api.get<{ disciplinary_action: DisciplinaryAction; tasks: DisciplinaryTask[] }>(`/employee-discipline/actions/${id}/tasks`),
  completeTask: (id: string, taskId: string, reason: string) => api.post<{ tasks: DisciplinaryTask[] }>(`/employee-discipline/actions/${id}/tasks/${taskId}/complete`, { reason }),
  waiveTask: (id: string, taskId: string, reason: string) => api.post<{ tasks: DisciplinaryTask[] }>(`/employee-discipline/actions/${id}/tasks/${taskId}/waive`, { reason }),
};
