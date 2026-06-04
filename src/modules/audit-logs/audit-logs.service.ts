import type { AuthActor } from "../../types/api.types";
import { NotFoundError } from "../../utils/errors";
import * as repository from "./audit-logs.repository";
import type { AuditLogFilters, AuditLogRecord } from "./audit-logs.types";

const SENSITIVE_KEYS = [
  "password",
  "password_hash",
  "totp",
  "secret",
  "backup_code",
  "session",
  "token",
  "file_key",
];

const maskValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(maskValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive))
        ? "[masked]"
        : maskValue(child),
    ]),
  );
};

const safeJson = (value: string | null) => {
  if (!value) return null;
  try {
    return maskValue(JSON.parse(value));
  } catch {
    return "[unavailable]";
  }
};

const sanitize = (row: AuditLogRecord) => ({
  id: row.id,
  company_id: row.company_id,
  outlet_id: row.outlet_id,
  module: row.module,
  action: row.action,
  severity: row.severity,
  entity_type: row.entity_type,
  entity_id: row.entity_id,
  employee_id: row.employee_id,
  actor_user_id: row.actor_user_id,
  actor_role_id: row.actor_role_id,
  device_id: row.device_id,
  ip_address: row.ip_address,
  user_agent: row.user_agent,
  old_value: safeJson(row.old_value_json),
  new_value: safeJson(row.new_value_json),
  reason: row.reason,
  effective_date: row.effective_date,
  approval_request_id: row.approval_request_id,
  sync_batch_id: row.sync_batch_id,
  created_at: row.created_at,
});

export const listAuditLogs = async (
  env: Env,
  context: AuthActor,
  filters: AuditLogFilters,
) => {
  const total = await repository.countAuditLogs(env, context.companyId, filters);
  const rows = await repository.listAuditLogs(env, context.companyId, filters);

  return {
    rows: rows.map(sanitize),
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.max(1, Math.ceil(total / filters.page_size)),
    },
  };
};

export const getAuditLog = async (env: Env, context: AuthActor, id: string) => {
  const row = await repository.findAuditLogById(env, context.companyId, id);
  if (!row) throw new NotFoundError("The requested audit log could not be found.");
  return sanitize(row);
};
