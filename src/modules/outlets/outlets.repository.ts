import type { OutletFilters, OutletRecord, OutletWriteInput } from "./outlets.types";

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

const where = (companyId: string, filters: OutletFilters) => {
  const clauses = ["company_id = ?", "deleted_at IS NULL"];
  const values: unknown[] = [companyId];
  if (filters.search) {
    clauses.push("(lower(name) LIKE lower(?) OR lower(COALESCE(code, '')) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  return { sql: clauses.join(" AND "), values };
};

export const countOutlets = async (env: Env, companyId: string, filters: OutletFilters) => {
  const built = where(companyId, filters);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM outlets WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listOutlets = (env: Env, companyId: string, filters: OutletFilters) => {
  const built = where(companyId, filters);
  return many<OutletRecord>(
    env,
    `SELECT * FROM outlets WHERE ${built.sql}
     ORDER BY ${filters.sort_by} ${filters.sort_direction.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findOutletById = (env: Env, companyId: string, id: string) =>
  one<OutletRecord>(
    env,
    "SELECT * FROM outlets WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findOutletByCode = (env: Env, companyId: string, code: string) =>
  one<OutletRecord>(
    env,
    "SELECT * FROM outlets WHERE company_id = ? AND code = ? LIMIT 1",
    [companyId, code],
  );

export const createOutlet = (
  env: Env,
  id: string,
  companyId: string,
  input: OutletWriteInput,
) =>
  run(
    env,
    `INSERT INTO outlets (
      id, company_id, name, code, address, phone, manager_user_id,
      gps_lat, gps_lng, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      input.name,
      input.code ?? null,
      input.address ?? null,
      input.phone ?? null,
      input.manager_user_id ?? null,
      input.gps_lat ?? null,
      input.gps_lng ?? null,
      input.status ?? "active",
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateOutlet = (
  env: Env,
  companyId: string,
  id: string,
  input: OutletWriteInput,
) =>
  run(
    env,
    `UPDATE outlets SET name = ?, code = ?, address = ?, phone = ?,
      manager_user_id = ?, gps_lat = ?, gps_lng = ?, status = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      input.name,
      input.code ?? null,
      input.address ?? null,
      input.phone ?? null,
      input.manager_user_id ?? null,
      input.gps_lat ?? null,
      input.gps_lng ?? null,
      input.status ?? "active",
      new Date().toISOString(),
      companyId,
      id,
    ],
  );
