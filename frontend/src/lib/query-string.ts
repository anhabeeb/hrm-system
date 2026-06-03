export type QueryValue = string | number | boolean | null | undefined;

export const buildQueryString = (params: object) => {
  const search = new URLSearchParams();

  Object.entries(params as Record<string, QueryValue>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const value = search.toString();
  return value ? `?${value}` : "";
};

export const searchParamNumber = (params: URLSearchParams, key: string, fallback: number) => {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
