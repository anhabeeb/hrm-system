import type { AuditLogFilters, AuditLogRecord } from "./audit-logs.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();

const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const buildWhere = (companyId: string, filters: AuditLogFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  const exact: Array<[keyof AuditLogFilters, string]> = [
    ["actor_user_id", "actor_user_id = ?"],
    ["module", "module = ?"],
    ["action", "action = ?"],
    ["entity_type", "entity_type = ?"],
    ["entity_id", "entity_id = ?"],
    ["severity", "severity = ?"],
  ];

  for (const [key, clause] of exact) {
    const value = filters[key];
    if (value) {
      clauses.push(clause);
      values.push(value);
    }
  }
  if (filters.request_id) {
    clauses.push("(id = ? OR approval_request_id = ? OR sync_batch_id = ?)");
    values.push(filters.request_id, filters.request_id, filters.request_id);
  }
  if (filters.date_from) {
    clauses.push("created_at >= ?");
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    clauses.push("created_at <= ?");
    values.push(filters.date_to);
  }

  return { sql: clauses.join(" AND "), values };
};

export const countAuditLogs = async (env: Env, companyId: string, filters: AuditLogFilters) => {
  const where = buildWhere(companyId, filters);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM audit_logs WHERE ${where.sql}`,
    where.values,
  );
  return row?.total ?? 0;
};

export const listAuditLogs = (env: Env, companyId: string, filters: AuditLogFilters) => {
  const where = buildWhere(companyId, filters);
  return many<AuditLogRecord>(
    env,
    `SELECT * FROM audit_logs WHERE ${where.sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...where.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findAuditLogById = (env: Env, companyId: string, id: string) =>
  one<AuditLogRecord>(
    env,
    "SELECT * FROM audit_logs WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );
