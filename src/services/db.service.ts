export const queryOne = async <T>(
  env: Env,
  sql: string,
  bindings: readonly unknown[] = [],
): Promise<T | null> => {
  const result = await env.DB.prepare(sql).bind(...bindings).first<T>();
  return result ?? null;
};

export const queryMany = async <T>(
  env: Env,
  sql: string,
  bindings: readonly unknown[] = [],
): Promise<T[]> => {
  const result = await env.DB.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
};

export const execute = async (
  env: Env,
  sql: string,
  bindings: readonly unknown[] = [],
) => env.DB.prepare(sql).bind(...bindings).run();
