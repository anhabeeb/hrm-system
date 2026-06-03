const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const normalizedBaseUrl = rawBaseUrl.replace(/\/$/, "");

export const appConfig = {
  appName: "HRM System",
  apiBaseUrl: normalizedBaseUrl,
  apiBaseUrlSource: rawBaseUrl ? "VITE_API_BASE_URL" : "same-origin",
  apiPrefix: "/api/v1",
  environmentLabel: import.meta.env.MODE === "production" ? "Production" : "Preview",
  buildVersion: import.meta.env.VITE_APP_VERSION?.trim() || "0.1.0",
};

export interface ApiUrlResolution {
  url: string;
  apiBaseUrl: string;
  apiBaseUrlSource: string;
  path: string;
}

export const resolveApiRequestInfo = (
  path: string,
  apiBaseUrl: string,
  apiBaseUrlSource: string,
  apiPrefix = "/api/v1",
): ApiUrlResolution => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const withPrefix = normalizedPath.startsWith(apiPrefix)
    ? normalizedPath
    : `${apiPrefix}${normalizedPath}`;

  if (!apiBaseUrl) {
    return {
      url: withPrefix,
      apiBaseUrl: "",
      apiBaseUrlSource,
      path: withPrefix,
    };
  }

  try {
    const resolved = new URL(withPrefix, apiBaseUrl);
    return {
      url: resolved.toString(),
      apiBaseUrl,
      apiBaseUrlSource,
      path: withPrefix,
    };
  } catch {
    return {
      url: `${apiBaseUrl}${withPrefix}`,
      apiBaseUrl,
      apiBaseUrlSource,
      path: withPrefix,
    };
  }
};

export const getApiRequestInfo = (path: string): ApiUrlResolution =>
  resolveApiRequestInfo(path, appConfig.apiBaseUrl, appConfig.apiBaseUrlSource, appConfig.apiPrefix);

export const getApiUrl = (path: string) => getApiRequestInfo(path).url;
