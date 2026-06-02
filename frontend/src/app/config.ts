const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

export const appConfig = {
  appName: "HRM System",
  apiBaseUrl: rawBaseUrl.replace(/\/$/, ""),
  apiPrefix: "/api/v1",
  environmentLabel: import.meta.env.MODE === "production" ? "Production" : "Preview",
};

export const getApiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const withPrefix = normalizedPath.startsWith(appConfig.apiPrefix)
    ? normalizedPath
    : `${appConfig.apiPrefix}${normalizedPath}`;

  return `${appConfig.apiBaseUrl}${withPrefix}`;
};
