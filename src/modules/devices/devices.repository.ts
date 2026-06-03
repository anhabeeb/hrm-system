import type { DeviceRecord } from "./devices.types";
import type { DeviceListFilters, DeviceOutletScope } from "./devices.types";

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

export const findDeviceByTokenHash = async (
  env: Env,
  tokenHash: string,
): Promise<DeviceRecord | null> =>
  one<DeviceRecord>(env, "SELECT * FROM devices WHERE device_token_hash = ? LIMIT 1", [tokenHash]);

export const touchDevice = async (env: Env, deviceId: string) =>
  run(env, "UPDATE devices SET last_seen_at = ?, updated_at = ? WHERE id = ?", [
    new Date().toISOString(),
    new Date().toISOString(),
    deviceId,
  ]);

const applyOutletScope = (
  clauses: string[],
  values: unknown[],
  alias: string,
  filters: { outlet_id?: string },
  scope: DeviceOutletScope,
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

const listWhere = (companyId: string, filters: DeviceListFilters, scope: DeviceOutletScope) => {
  const clauses = ["d.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "d", filters, scope);
  if (filters.outlet_id) { clauses.push("d.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.device_type) { clauses.push("d.device_type = ?"); values.push(filters.device_type); }
  if (filters.status) { clauses.push("d.status = ?"); values.push(filters.status); }
  if (filters.search) {
    clauses.push("(lower(d.device_name) LIKE lower(?) OR lower(d.id) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  return { sql: clauses.join(" AND "), values };
};

export const listDevices = (
  env: Env,
  companyId: string,
  filters: DeviceListFilters,
  scope: DeviceOutletScope,
) => {
  const built = listWhere(companyId, filters, scope);
  return many<Omit<DeviceRecord, "device_token_hash"> & { outlet_name: string | null }>(
    env,
    `SELECT d.id, d.company_id, d.outlet_id, d.device_name, d.device_type,
      d.status, d.last_seen_at, d.last_sync_at, d.created_at, d.updated_at,
      o.name AS outlet_name
     FROM devices d
     LEFT JOIN outlets o ON o.id = d.outlet_id
     WHERE ${built.sql}
     ORDER BY d.updated_at DESC
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countDevices = async (
  env: Env,
  companyId: string,
  filters: DeviceListFilters,
  scope: DeviceOutletScope,
) => {
  const built = listWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM devices d WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const findDeviceById = (env: Env, companyId: string, id: string) =>
  one<DeviceRecord & { outlet_name?: string | null }>(
    env,
    `SELECT d.*, o.name AS outlet_name
     FROM devices d LEFT JOIN outlets o ON o.id = d.outlet_id
     WHERE d.company_id = ? AND d.id = ? LIMIT 1`,
    [companyId, id],
  );

export const findActiveOutlet = (env: Env, companyId: string, outletId: string) =>
  one<{ id: string; status: string }>(
    env,
    "SELECT id, status FROM outlets WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, outletId],
  );

export const createDevice = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    outletId: string;
    deviceName: string;
    deviceType: string;
    tokenHash: string;
  },
) =>
  run(
    env,
    `INSERT INTO devices (
      id, company_id, outlet_id, device_name, device_type, device_token_hash,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      input.id,
      input.companyId,
      input.outletId,
      input.deviceName,
      input.deviceType,
      input.tokenHash,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateDevice = (
  env: Env,
  companyId: string,
  id: string,
  input: {
    outletId?: string;
    deviceName?: string;
    deviceType?: string;
    status?: string;
  },
) =>
  run(
    env,
    `UPDATE devices
     SET outlet_id = COALESCE(?, outlet_id),
       device_name = COALESCE(?, device_name),
       device_type = COALESCE(?, device_type),
       status = COALESCE(?, status),
       updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      input.outletId ?? null,
      input.deviceName ?? null,
      input.deviceType ?? null,
      input.status ?? null,
      new Date().toISOString(),
      companyId,
      id,
    ],
  );

export const updateDeviceStatus = (env: Env, companyId: string, id: string, status: string) =>
  run(
    env,
    "UPDATE devices SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [status, new Date().toISOString(), companyId, id],
  );

export const updateDeviceToken = (env: Env, companyId: string, id: string, tokenHash: string) =>
  run(
    env,
    "UPDATE devices SET device_token_hash = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [tokenHash, new Date().toISOString(), companyId, id],
  );

export const createDeviceSyncState = (
  env: Env,
  input: { id: string; companyId: string; outletId?: string | null; deviceId: string },
) =>
  run(
    env,
    `INSERT OR IGNORE INTO device_sync_state (
      id, company_id, outlet_id, device_id, last_sync_token,
      pending_count, failed_count, conflict_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.outletId ?? null,
      input.deviceId,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const upsertDeviceSyncState = (
  env: Env,
  input: {
    companyId: string;
    outletId?: string | null;
    deviceId: string;
    pendingCount?: number;
    failedCount?: number;
    conflictCount?: number;
  },
) =>
  run(
    env,
    `INSERT INTO device_sync_state (
      id, company_id, outlet_id, device_id, pending_count, failed_count,
      conflict_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, device_id) DO UPDATE SET
      outlet_id = excluded.outlet_id,
      pending_count = excluded.pending_count,
      failed_count = excluded.failed_count,
      conflict_count = excluded.conflict_count,
      updated_at = excluded.updated_at`,
    [
      `dev_state_${input.deviceId}`,
      input.companyId,
      input.outletId ?? null,
      input.deviceId,
      input.pendingCount ?? 0,
      input.failedCount ?? 0,
      input.conflictCount ?? 0,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const createHealthLog = (
  env: Env,
  input: {
    companyId: string;
    outletId?: string | null;
    deviceId: string;
    deviceType: string;
    healthStatus: string;
    pendingCount: number;
    failedCount: number;
    conflictCount: number;
    batteryLevel?: number;
    appVersion?: string;
    networkStatus?: string;
  },
) =>
  run(
    env,
    `INSERT INTO device_health_logs (
      id, company_id, outlet_id, device_id, device_type, health_status,
      pending_count, failed_count, conflict_count, battery_level,
      app_version, network_status, reported_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `health_${crypto.randomUUID()}`,
      input.companyId,
      input.outletId ?? null,
      input.deviceId,
      input.deviceType,
      input.healthStatus,
      input.pendingCount,
      input.failedCount,
      input.conflictCount,
      input.batteryLevel ?? null,
      input.appVersion ?? null,
      input.networkStatus ?? null,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const listHealthLogs = (
  env: Env,
  companyId: string,
  deviceId: string,
  page: number,
  pageSize: number,
) =>
  many(
    env,
    `SELECT * FROM device_health_logs
     WHERE company_id = ? AND device_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [companyId, deviceId, pageSize, (page - 1) * pageSize],
  );

export const healthSummary = (
  env: Env,
  companyId: string,
  filters: DeviceListFilters,
  scope: DeviceOutletScope,
) => {
  const clauses = ["d.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "d", filters, scope);
  if (filters.outlet_id) { clauses.push("d.outlet_id = ?"); values.push(filters.outlet_id); }
  return many(
    env,
    `SELECT d.id AS device_id, d.device_name, d.device_type, d.status,
      d.outlet_id, o.name AS outlet_name, d.last_seen_at, d.last_sync_at,
      (SELECT h.health_status FROM device_health_logs h WHERE h.company_id = d.company_id AND h.device_id = d.id ORDER BY h.created_at DESC LIMIT 1) AS latest_health_status,
      (SELECT h.pending_count FROM device_health_logs h WHERE h.company_id = d.company_id AND h.device_id = d.id ORDER BY h.created_at DESC LIMIT 1) AS pending_count,
      (SELECT h.failed_count FROM device_health_logs h WHERE h.company_id = d.company_id AND h.device_id = d.id ORDER BY h.created_at DESC LIMIT 1) AS failed_count,
      (SELECT h.conflict_count FROM device_health_logs h WHERE h.company_id = d.company_id AND h.device_id = d.id ORDER BY h.created_at DESC LIMIT 1) AS conflict_count
     FROM devices d LEFT JOIN outlets o ON o.id = d.outlet_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY d.updated_at DESC
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};
