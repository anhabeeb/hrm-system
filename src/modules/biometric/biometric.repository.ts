import type {
  BiometricDeviceInput,
  BiometricDeviceUpdateInput,
  BiometricListFilters,
  BiometricLogRecord,
  BiometricOutletScope,
} from "./biometric.types";

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
  scope: BiometricOutletScope,
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

export const findDeviceById = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    "SELECT * FROM biometric_devices WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findDeviceBySerial = (env: Env, companyId: string, serial: string) =>
  one<any>(
    env,
    "SELECT * FROM biometric_devices WHERE company_id = ? AND device_serial = ? LIMIT 1",
    [companyId, serial],
  );

export const createDevice = (
  env: Env,
  id: string,
  companyId: string,
  input: BiometricDeviceInput,
  tokenHash: string,
) =>
  run(
    env,
    `INSERT INTO biometric_devices (
      id, company_id, outlet_id, device_name, device_serial, device_type,
      sync_mode, api_token_hash, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      id,
      companyId,
      input.outlet_id,
      input.device_name,
      input.device_serial,
      input.device_type,
      input.sync_mode,
      tokenHash,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateDevice = (
  env: Env,
  companyId: string,
  id: string,
  input: BiometricDeviceUpdateInput,
) =>
  run(
    env,
    `UPDATE biometric_devices
     SET outlet_id = COALESCE(?, outlet_id),
       device_name = COALESCE(?, device_name),
       device_serial = COALESCE(?, device_serial),
       device_type = COALESCE(?, device_type),
       sync_mode = COALESCE(?, sync_mode),
       updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      input.outlet_id ?? null,
      input.device_name ?? null,
      input.device_serial ?? null,
      input.device_type ?? null,
      input.sync_mode ?? null,
      new Date().toISOString(),
      companyId,
      id,
    ],
  );

export const updateDeviceStatus = (env: Env, companyId: string, id: string, status: string) =>
  run(
    env,
    "UPDATE biometric_devices SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [status, new Date().toISOString(), companyId, id],
  );

export const updateDeviceToken = (env: Env, companyId: string, id: string, tokenHash: string) =>
  run(
    env,
    "UPDATE biometric_devices SET api_token_hash = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [tokenHash, new Date().toISOString(), companyId, id],
  );

const deviceWhere = (companyId: string, filters: BiometricListFilters, scope: BiometricOutletScope) => {
  const clauses = ["d.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "d", filters, scope);
  if (filters.outlet_id) { clauses.push("d.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.device_type) { clauses.push("d.device_type = ?"); values.push(filters.device_type); }
  if (filters.sync_mode) { clauses.push("d.sync_mode = ?"); values.push(filters.sync_mode); }
  if (filters.status) { clauses.push("d.status = ?"); values.push(filters.status); }
  if (filters.search) {
    clauses.push("(lower(d.device_name) LIKE lower(?) OR lower(d.device_serial) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  return { sql: clauses.join(" AND "), values };
};

export const listDevices = (
  env: Env,
  companyId: string,
  filters: BiometricListFilters,
  scope: BiometricOutletScope,
) => {
  const built = deviceWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT d.id, d.company_id, d.outlet_id, o.name AS outlet_name,
      d.device_name, d.device_serial, d.device_type, d.sync_mode,
      d.status, d.last_seen_at, d.last_sync_at, d.created_at, d.updated_at
     FROM biometric_devices d
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
  filters: BiometricListFilters,
  scope: BiometricOutletScope,
) => {
  const built = deviceWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM biometric_devices d WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const findMapping = (
  env: Env,
  companyId: string,
  deviceId: string,
  biometricUserId: string,
) =>
  one<any>(
    env,
    `SELECT l.*, e.primary_outlet_id, e.employment_status, e.deleted_at
     FROM employee_biometric_links l
     JOIN employees e ON e.id = l.employee_id
     WHERE l.company_id = ? AND l.device_id = ? AND l.biometric_user_id = ?
       AND l.is_active = 1
     LIMIT 1`,
    [companyId, deviceId, biometricUserId],
  );

export const findMappingById = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    `SELECT l.*, e.primary_outlet_id
     FROM employee_biometric_links l
     JOIN employees e ON e.id = l.employee_id
     WHERE l.company_id = ? AND l.id = ? LIMIT 1`,
    [companyId, id],
  );

export const createMapping = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    employeeId: string;
    deviceId: string;
    biometricUserId: string;
    enrollmentStatus: string;
  },
) =>
  run(
    env,
    `INSERT INTO employee_biometric_links (
      id, company_id, employee_id, device_id, biometric_user_id,
      enrollment_status, is_active, enrolled_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.deviceId,
      input.biometricUserId,
      input.enrollmentStatus,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateMapping = (
  env: Env,
  companyId: string,
  id: string,
  input: { employeeId?: string; biometricUserId?: string; enrollmentStatus?: string },
) =>
  run(
    env,
    `UPDATE employee_biometric_links
     SET employee_id = COALESCE(?, employee_id),
       biometric_user_id = COALESCE(?, biometric_user_id),
       enrollment_status = COALESCE(?, enrollment_status),
       updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      input.employeeId ?? null,
      input.biometricUserId ?? null,
      input.enrollmentStatus ?? null,
      new Date().toISOString(),
      companyId,
      id,
    ],
  );

export const disableMapping = (env: Env, companyId: string, id: string) =>
  run(
    env,
    "UPDATE employee_biometric_links SET is_active = 0, updated_at = ? WHERE company_id = ? AND id = ?",
    [new Date().toISOString(), companyId, id],
  );

const mappingWhere = (companyId: string, filters: BiometricListFilters, scope: BiometricOutletScope) => {
  const clauses = ["l.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "e", filters, scope);
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.employee_id) { clauses.push("l.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.device_id) { clauses.push("l.device_id = ?"); values.push(filters.device_id); }
  if (filters.biometric_user_id) { clauses.push("l.biometric_user_id = ?"); values.push(filters.biometric_user_id); }
  if (filters.enrollment_status) { clauses.push("l.enrollment_status = ?"); values.push(filters.enrollment_status); }
  if (filters.is_active !== undefined) { clauses.push("l.is_active = ?"); values.push(filters.is_active); }
  return { sql: clauses.join(" AND "), values };
};

export const listMappings = (
  env: Env,
  companyId: string,
  filters: BiometricListFilters,
  scope: BiometricOutletScope,
) => {
  const built = mappingWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT l.*, e.employee_code, e.full_name AS employee_name,
      e.primary_outlet_id, d.device_name
     FROM employee_biometric_links l
     JOIN employees e ON e.id = l.employee_id
     LEFT JOIN biometric_devices d ON d.id = l.device_id
     WHERE ${built.sql}
     ORDER BY l.updated_at DESC
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countMappings = async (
  env: Env,
  companyId: string,
  filters: BiometricListFilters,
  scope: BiometricOutletScope,
) => {
  const built = mappingWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM employee_biometric_links l JOIN employees e ON e.id = l.employee_id
     WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const findLogByDedupeKey = (env: Env, companyId: string, dedupeKey: string) =>
  one<BiometricLogRecord>(
    env,
    "SELECT * FROM biometric_attendance_logs WHERE company_id = ? AND dedupe_key = ? LIMIT 1",
    [companyId, dedupeKey],
  );

export const findLogById = (env: Env, companyId: string, id: string) =>
  one<BiometricLogRecord>(
    env,
    "SELECT * FROM biometric_attendance_logs WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const createLog = (
  env: Env,
  input: Omit<BiometricLogRecord, "created_at" | "updated_at">,
) =>
  run(
    env,
    `INSERT INTO biometric_attendance_logs (
      id, company_id, device_id, outlet_id, biometric_user_id, employee_id,
      event_time, server_received_at, event_type, verification_method,
      raw_payload_json, dedupe_key, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.company_id,
      input.device_id,
      input.outlet_id,
      input.biometric_user_id,
      input.employee_id,
      input.event_time,
      input.server_received_at,
      input.event_type,
      input.verification_method,
      input.raw_payload_json,
      input.dedupe_key,
      input.sync_status,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateLogStatus = (
  env: Env,
  companyId: string,
  id: string,
  status: string,
  employeeId?: string | null,
) =>
  run(
    env,
    "UPDATE biometric_attendance_logs SET sync_status = ?, employee_id = COALESCE(?, employee_id), updated_at = ? WHERE company_id = ? AND id = ?",
    [status, employeeId ?? null, new Date().toISOString(), companyId, id],
  );

const logWhere = (companyId: string, filters: BiometricListFilters, scope: BiometricOutletScope, unmatched = false) => {
  const clauses = ["l.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "l", filters, scope);
  if (unmatched) clauses.push("(l.employee_id IS NULL OR l.sync_status = 'unmatched')");
  if (filters.outlet_id) { clauses.push("l.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.device_id) { clauses.push("l.device_id = ?"); values.push(filters.device_id); }
  if (filters.employee_id) { clauses.push("l.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.biometric_user_id) { clauses.push("l.biometric_user_id = ?"); values.push(filters.biometric_user_id); }
  if (filters.event_type) { clauses.push("l.event_type = ?"); values.push(filters.event_type); }
  if (filters.sync_status) { clauses.push("l.sync_status = ?"); values.push(filters.sync_status); }
  if (filters.date_from) { clauses.push("l.event_time >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("l.event_time <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

export const listLogs = (
  env: Env,
  companyId: string,
  filters: BiometricListFilters,
  scope: BiometricOutletScope,
  unmatched = false,
) => {
  const built = logWhere(companyId, filters, scope, unmatched);
  return many<any>(
    env,
    `SELECT l.id, l.company_id, l.device_id, l.outlet_id, l.biometric_user_id,
      l.employee_id, e.employee_code, e.full_name AS employee_name,
      l.event_time, l.server_received_at, l.event_type, l.verification_method,
      l.dedupe_key, l.sync_status, l.created_at, l.updated_at
     FROM biometric_attendance_logs l
     LEFT JOIN employees e ON e.id = l.employee_id
     WHERE ${built.sql}
     ORDER BY l.event_time DESC
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countLogs = async (
  env: Env,
  companyId: string,
  filters: BiometricListFilters,
  scope: BiometricOutletScope,
  unmatched = false,
) => {
  const built = logWhere(companyId, filters, scope, unmatched);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM biometric_attendance_logs l WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};
