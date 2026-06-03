import type {
  SyncBatchRecord,
  SyncChangeRecord,
  SyncConflictRecord,
  SyncListFilters,
  SyncOutletScope,
} from "./sync.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).run();

const applyOutletScope = (
  clauses: string[],
  values: unknown[],
  alias: string,
  filters: { outlet_id?: string },
  scope: SyncOutletScope,
) => {
  if (scope.isSuperAdmin) return;
  if (scope.outletIds.length === 0) {
    clauses.push("1 = 0");
    return;
  }
  if (filters.outlet_id && !scope.outletIds.includes(filters.outlet_id)) {
    clauses.push("1 = 0");
    return;
  }
  clauses.push(`${alias}.outlet_id IN (${scope.outletIds.map(() => "?").join(", ")})`);
  values.push(...scope.outletIds);
};

export const findBatchByClientId = (
  env: Env,
  companyId: string,
  deviceId: string,
  batchId: string,
) =>
  one<SyncBatchRecord>(
    env,
    "SELECT * FROM sync_batches WHERE company_id = ? AND device_id = ? AND batch_id = ? LIMIT 1",
    [companyId, deviceId, batchId],
  );

export const createBatch = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    outletId: string | null;
    deviceId: string;
    batchId: string;
    eventCount: number;
  },
) =>
  run(
    env,
    `INSERT OR IGNORE INTO sync_batches (
      id, company_id, outlet_id, device_id, batch_id, event_count,
      accepted_count, rejected_count, conflict_count, status, received_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 'received', ?, ?)`,
    [
      input.id,
      input.companyId,
      input.outletId,
      input.deviceId,
      input.batchId,
      input.eventCount,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateBatchResult = (
  env: Env,
  id: string,
  accepted: number,
  rejected: number,
  conflicts: number,
  status: string,
  errorMessage?: string | null,
) =>
  run(
    env,
    `UPDATE sync_batches
     SET accepted_count = ?, rejected_count = ?, conflict_count = ?, status = ?, error_message = ?
     WHERE id = ?`,
    [accepted, rejected, conflicts, status, errorMessage ?? null, id],
  );

export const createSyncItem = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    outletId: string | null;
    deviceId: string;
    batchRowId: string;
    localId: string;
    entityType: string;
    actionType: string;
    payloadJson: string;
    createdOfflineAt?: string | null;
  },
) =>
  run(
    env,
    `INSERT INTO sync_items (
      id, company_id, outlet_id, device_id, batch_id, local_id, entity_type,
      action_type, payload_json, sync_status, created_offline_at,
      server_received_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.outletId,
      input.deviceId,
      input.batchRowId,
      input.localId,
      input.entityType,
      input.actionType,
      input.payloadJson,
      input.createdOfflineAt ?? null,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateSyncItemResult = (
  env: Env,
  id: string,
  status: string,
  serverEntityId?: string | null,
  errorMessage?: string | null,
) =>
  run(
    env,
    "UPDATE sync_items SET sync_status = ?, server_entity_id = ?, error_message = ?, updated_at = ? WHERE id = ?",
    [status, serverEntityId ?? null, errorMessage ?? null, new Date().toISOString(), id],
  );

export const findSyncItem = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM sync_items WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const nextChangeVersion = async (env: Env, companyId: string) => {
  const row = await one<{ version: number }>(
    env,
    "SELECT COALESCE(MAX(change_version), 0) + 1 AS version FROM sync_changes WHERE company_id = ?",
    [companyId],
  );
  return row?.version ?? 1;
};

export const createChange = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    outletId?: string | null;
    entityType: string;
    entityId: string;
    actionType: string;
    changeVersion: number;
    changedBy?: string | null;
    payloadSummaryJson?: string | null;
  },
) =>
  run(
    env,
    `INSERT INTO sync_changes (
      id, company_id, outlet_id, entity_type, entity_id, action_type,
      change_version, changed_by, changed_at, payload_summary_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.outletId ?? null,
      input.entityType,
      input.entityId,
      input.actionType,
      input.changeVersion,
      input.changedBy ?? null,
      new Date().toISOString(),
      input.payloadSummaryJson ?? null,
    ],
  );

export const getMaxChangeVersion = async (env: Env, companyId: string) => {
  const row = await one<{ version: number }>(
    env,
    "SELECT COALESCE(MAX(change_version), 0) AS version FROM sync_changes WHERE company_id = ?",
    [companyId],
  );
  return row?.version ?? 0;
};

export const listPullChanges = (
  env: Env,
  companyId: string,
  outletId: string,
  since: number,
) =>
  many<SyncChangeRecord>(
    env,
    `SELECT * FROM sync_changes
     WHERE company_id = ? AND change_version > ? AND (outlet_id = ? OR outlet_id IS NULL)
     ORDER BY change_version ASC
     LIMIT 500`,
    [companyId, since, outletId],
  );

export const listSafeEmployeesForOutlet = (env: Env, companyId: string, outletId: string) =>
  many(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.primary_outlet_id,
      e.employment_status, e.department_id, d.name AS department_name,
      e.position_id, p.title AS position_title, e.updated_at
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE e.company_id = ? AND e.primary_outlet_id = ? AND e.deleted_at IS NULL
       AND e.employment_status NOT IN ('archived', 'resigned', 'terminated')
     ORDER BY e.full_name
     LIMIT 500`,
    [companyId, outletId],
  );

export const listChangedEmployeesForOutlet = (
  env: Env,
  companyId: string,
  outletId: string,
  since: number,
) =>
  many(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.primary_outlet_id,
      e.employment_status, e.department_id, d.name AS department_name,
      e.position_id, p.title AS position_title, e.updated_at,
      sc.change_version, sc.action_type AS sync_action_type
     FROM sync_changes sc
     JOIN employees e ON e.id = sc.entity_id AND e.company_id = sc.company_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE sc.company_id = ? AND sc.outlet_id = ? AND sc.entity_type = 'employee'
       AND sc.change_version > ?
     ORDER BY sc.change_version ASC
     LIMIT 500`,
    [companyId, outletId, since],
  );

export const listChangedAttendanceForOutlet = (
  env: Env,
  companyId: string,
  outletId: string,
  since: number,
) =>
  many(
    env,
    `SELECT sc.change_version, sc.action_type AS sync_action_type,
      sc.payload_summary_json, ev.id, ev.employee_id, ev.outlet_id,
      ev.event_type, ev.event_time, ev.attendance_method, ev.source,
      ev.sync_status, ev.approval_status, ev.updated_at
     FROM sync_changes sc
     LEFT JOIN attendance_events ev ON ev.id = sc.entity_id AND ev.company_id = sc.company_id
     WHERE sc.company_id = ? AND sc.outlet_id = ?
       AND sc.entity_type IN ('attendance', 'attendance_event', 'attendance_summary')
       AND sc.change_version > ?
     ORDER BY sc.change_version ASC
     LIMIT 500`,
    [companyId, outletId, since],
  );

export const createConflict = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    outletId?: string | null;
    deviceId?: string | null;
    employeeId?: string | null;
    entityType: string;
    localId?: string | null;
    conflictType: string;
    localPayloadJson?: string | null;
    serverPayloadJson?: string | null;
  },
) =>
  run(
    env,
    `INSERT INTO sync_conflicts (
      id, company_id, outlet_id, device_id, employee_id, entity_type, local_id,
      conflict_type, local_payload_json, server_payload_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      input.id,
      input.companyId,
      input.outletId ?? null,
      input.deviceId ?? null,
      input.employeeId ?? null,
      input.entityType,
      input.localId ?? null,
      input.conflictType,
      input.localPayloadJson ?? null,
      input.serverPayloadJson ?? null,
      new Date().toISOString(),
    ],
  );

const conflictWhere = (companyId: string, filters: SyncListFilters, scope: SyncOutletScope) => {
  const clauses = ["c.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "c", filters, scope);
  if (filters.status) { clauses.push("c.status = ?"); values.push(filters.status); }
  if (filters.conflict_type) { clauses.push("c.conflict_type = ?"); values.push(filters.conflict_type); }
  if (filters.entity_type) { clauses.push("c.entity_type = ?"); values.push(filters.entity_type); }
  if (filters.employee_id) { clauses.push("c.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("c.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.device_id) { clauses.push("c.device_id = ?"); values.push(filters.device_id); }
  if (filters.date_from) { clauses.push("c.created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("c.created_at <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

export const listConflicts = (
  env: Env,
  companyId: string,
  filters: SyncListFilters,
  scope: SyncOutletScope,
) => {
  const built = conflictWhere(companyId, filters, scope);
  return many<SyncConflictRecord>(
    env,
    `SELECT c.* FROM sync_conflicts c
     WHERE ${built.sql}
     ORDER BY c.created_at ${filters.sort_direction?.toUpperCase() ?? "DESC"}
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countConflicts = async (
  env: Env,
  companyId: string,
  filters: SyncListFilters,
  scope: SyncOutletScope,
) => {
  const built = conflictWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM sync_conflicts c WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const findConflictById = (env: Env, companyId: string, id: string) =>
  one<SyncConflictRecord>(
    env,
    "SELECT * FROM sync_conflicts WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const resolveConflict = (
  env: Env,
  companyId: string,
  id: string,
  resolvedBy: string,
  status: string,
  notes: string,
) =>
  run(
    env,
    "UPDATE sync_conflicts SET status = ?, resolved_by = ?, resolution_notes = ?, resolved_at = ? WHERE company_id = ? AND id = ?",
    [status, resolvedBy, notes, new Date().toISOString(), companyId, id],
  );

const batchWhere = (companyId: string, filters: SyncListFilters, scope: SyncOutletScope) => {
  const clauses = ["b.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "b", filters, scope);
  if (filters.status) { clauses.push("b.status = ?"); values.push(filters.status); }
  if (filters.outlet_id) { clauses.push("b.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.device_id) { clauses.push("b.device_id = ?"); values.push(filters.device_id); }
  if (filters.date_from) { clauses.push("b.created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("b.created_at <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

export const listBatches = (
  env: Env,
  companyId: string,
  filters: SyncListFilters,
  scope: SyncOutletScope,
) => {
  const built = batchWhere(companyId, filters, scope);
  return many<SyncBatchRecord>(
    env,
    `SELECT b.* FROM sync_batches b
     WHERE ${built.sql}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countBatches = async (
  env: Env,
  companyId: string,
  filters: SyncListFilters,
  scope: SyncOutletScope,
) => {
  const built = batchWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM sync_batches b WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const findBatchById = (env: Env, companyId: string, id: string) =>
  one<SyncBatchRecord>(
    env,
    "SELECT * FROM sync_batches WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const listBatchItems = (env: Env, companyId: string, batchRowId: string) =>
  many<any>(
    env,
    "SELECT * FROM sync_items WHERE company_id = ? AND batch_id = ? ORDER BY created_at ASC LIMIT 200",
    [companyId, batchRowId],
  );

export const upsertDeviceSyncState = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    outletId?: string | null;
    deviceId: string;
    lastPushAt?: string | null;
    lastPullAt?: string | null;
    lastSyncToken?: number;
    pendingCount?: number;
    failedCount?: number;
    conflictCount?: number;
  },
) =>
  run(
    env,
    `INSERT INTO device_sync_state (
      id, company_id, outlet_id, device_id, last_push_at, last_pull_at,
      last_sync_token, pending_count, failed_count, conflict_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, device_id) DO UPDATE SET
      outlet_id = excluded.outlet_id,
      last_push_at = COALESCE(excluded.last_push_at, device_sync_state.last_push_at),
      last_pull_at = COALESCE(excluded.last_pull_at, device_sync_state.last_pull_at),
      last_sync_token = COALESCE(excluded.last_sync_token, device_sync_state.last_sync_token),
      pending_count = COALESCE(excluded.pending_count, device_sync_state.pending_count),
      failed_count = COALESCE(excluded.failed_count, device_sync_state.failed_count),
      conflict_count = COALESCE(excluded.conflict_count, device_sync_state.conflict_count),
      updated_at = excluded.updated_at`,
    [
      input.id,
      input.companyId,
      input.outletId ?? null,
      input.deviceId,
      input.lastPushAt ?? null,
      input.lastPullAt ?? null,
      input.lastSyncToken ?? null,
      input.pendingCount ?? null,
      input.failedCount ?? null,
      input.conflictCount ?? null,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const getSyncStatus = (
  env: Env,
  companyId: string,
  filters: SyncListFilters,
  scope: SyncOutletScope,
) => {
  const clauses = ["s.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "s", filters, scope);
  if (filters.outlet_id) { clauses.push("s.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.device_id) { clauses.push("s.device_id = ?"); values.push(filters.device_id); }
  return one<{
    pending_count: number;
    failed_count: number;
    conflict_count: number;
    last_push_at: string | null;
    last_pull_at: string | null;
    last_sync_token: number;
  }>(
    env,
    `SELECT COALESCE(SUM(pending_count), 0) AS pending_count,
      COALESCE(SUM(failed_count), 0) AS failed_count,
      COALESCE(SUM(conflict_count), 0) AS conflict_count,
      MAX(last_push_at) AS last_push_at,
      MAX(last_pull_at) AS last_pull_at,
      COALESCE(MAX(last_sync_token), 0) AS last_sync_token
     FROM device_sync_state s
     WHERE ${clauses.join(" AND ")}`,
    values,
  );
};

export const resetDeviceSyncToken = (env: Env, companyId: string, deviceId: string) =>
  run(
    env,
    "UPDATE device_sync_state SET last_sync_token = 0, updated_at = ? WHERE company_id = ? AND device_id = ?",
    [new Date().toISOString(), companyId, deviceId],
  );

export const listPayrollSyncBlockerItems = (
  env: Env,
  companyId: string,
  outletId?: string,
) => {
  const clauses = ["company_id = ?", "entity_type = 'attendance'", "sync_status IN ('pending', 'failed')"];
  const values: unknown[] = [companyId];
  if (outletId) { clauses.push("outlet_id = ?"); values.push(outletId); }
  return many<{
    id: string;
    sync_status: string;
    created_offline_at: string | null;
    payload_json: string | null;
    server_entity_id: string | null;
  }>(
    env,
    `SELECT id, sync_status, created_offline_at, payload_json, server_entity_id
     FROM sync_items
     WHERE ${clauses.join(" AND ")}
     LIMIT 1000`,
    values,
  );
};

export const listPayrollSyncBlockerConflicts = (
  env: Env,
  companyId: string,
  outletId?: string,
) => {
  const clauses = ["company_id = ?", "entity_type = 'attendance'", "status = 'pending'"];
  const values: unknown[] = [companyId];
  if (outletId) { clauses.push("outlet_id = ?"); values.push(outletId); }
  return many<{
    id: string;
    local_payload_json: string | null;
    server_payload_json: string | null;
  }>(
    env,
    `SELECT id, local_payload_json, server_payload_json
     FROM sync_conflicts
     WHERE ${clauses.join(" AND ")}
     LIMIT 1000`,
    values,
  );
};
