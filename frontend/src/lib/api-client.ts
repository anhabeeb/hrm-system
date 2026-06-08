import { appConfig, getApiRequestInfo } from "@/app/config";
import type { ApiErrorResponse, ApiResponse, StandardApiResponse } from "@/types/api";

import {
  ApiError,
  createApiBaseUrlInvalidError,
  createCorsBlockedError,
  createHtmlApiResponseError,
  createInvalidApiResponseError,
  createMixedContentError,
  createNetworkError,
  createTimeoutError,
  friendlyMessageForStatus,
  handleSessionExpired,
  type ApiErrorDiagnostics,
} from "./api-errors";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  headers?: Record<string, string>;
  suppressSessionExpired?: boolean;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

const nowIso = () => new Date().toISOString();

const currentPageUrl = () =>
  typeof window === "undefined" ? undefined : window.location.href;

const browserOnline = () =>
  typeof navigator === "undefined" ? undefined : navigator.onLine;

const isCrossOrigin = (url: string) => {
  if (typeof window === "undefined") return false;
  try {
    return new URL(url, window.location.origin).origin !== window.location.origin;
  } catch {
    return false;
  }
};

const isMixedContent = (url: string) => {
  if (typeof window === "undefined") return false;
  try {
    const resolved = new URL(url, window.location.origin);
    return window.location.protocol === "https:" && resolved.protocol === "http:";
  } catch {
    return false;
  }
};

const validateApiBaseUrl = (apiBaseUrl: string) => {
  if (!apiBaseUrl) return;
  const url = new URL(apiBaseUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("API base URL must use http or https.");
  }
};

const diagnostics = (input: {
  requestUrl: string;
  apiBaseUrl: string;
  apiBaseUrlSource: string;
  method: HttpMethod;
  startedAt: number;
  requestStartedAt: string;
  error?: unknown;
  timeout?: boolean;
}): ApiErrorDiagnostics => {
  const endedAt = Date.now();
  const error = input.error;
  const errorName = error instanceof Error ? error.name : error ? String(error) : undefined;
  const errorMessage = error instanceof Error ? error.message : undefined;

  return {
    requestUrl: input.requestUrl,
    apiBaseUrl: input.apiBaseUrl,
    apiBaseUrlSource: input.apiBaseUrlSource,
    method: input.method,
    browserOnline: browserOnline(),
    errorName,
    errorMessage,
    timeout: input.timeout ?? false,
    corsSuspected: isCrossOrigin(input.requestUrl) && browserOnline() !== false && errorName === "TypeError",
    mixedContentSuspected: isMixedContent(input.requestUrl),
    currentPageUrl: currentPageUrl(),
    buildVersion: appConfig.buildVersion,
    requestStartedAt: input.requestStartedAt,
    requestEndedAt: nowIso(),
    elapsedMs: endedAt - input.startedAt,
  };
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const shouldRetryStartupGet = (method: HttpMethod, path: string, attempt: number) =>
  attempt === 0 &&
  method === "GET" &&
  ["/health", "/bootstrap/status", "/auth/me"].some((prefix) => path === prefix || path.endsWith(prefix));

const parseResponse = async <T>(
  response: Response,
  requestMeta: { method: HttpMethod; path: string; diagnostics: ApiErrorDiagnostics },
  options: RequestOptions = {},
): Promise<ApiResponse<T>> => {
  const contentType = response.headers.get("content-type") ?? "";
  let body: StandardApiResponse<T> | null = null;

  if (contentType.includes("application/json")) {
    try {
      body = (await response.json()) as StandardApiResponse<T>;
    } catch {
      throw createInvalidApiResponseError(response.status, requestMeta.diagnostics);
    }
  }

  if (!response.ok || !body || body.success === false) {
    if (!body) {
      const invalidError = contentType.includes("text/html")
        ? createHtmlApiResponseError(response.status, requestMeta.diagnostics)
        : createInvalidApiResponseError(response.status, requestMeta.diagnostics);
      if (!options.suppressSessionExpired) {
        handleSessionExpired(invalidError);
      }
      throw invalidError;
    }

    const errorBody = body as ApiErrorResponse | null;
    const message = errorBody?.error?.message ?? friendlyMessageForStatus(response.status);
    const error = new ApiError(message, {
      code: errorBody?.error?.code ?? `HTTP_${response.status}`,
      status: response.status,
      title: errorBody?.error?.title,
      requestId: errorBody?.error?.requestId ?? errorBody?.requestId ?? errorBody?.request_id ?? response.headers.get("x-request-id") ?? undefined,
      technicalMessage: errorBody?.error?.technicalMessage,
      route: errorBody?.error?.route ?? requestMeta.path,
      method: errorBody?.error?.method ?? requestMeta.method,
      step: errorBody?.error?.step,
      retryable: errorBody?.error?.retryable,
      suggestedAction: errorBody?.error?.suggestedAction,
      fieldErrors: errorBody?.error?.fieldErrors,
      details: errorBody?.error?.details,
      diagnostics: requestMeta.diagnostics,
    });
    if (!options.suppressSessionExpired) {
      handleSessionExpired(error);
    }
    throw error;
  }

  return body;
};

const request = async <T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
  attempt = 0,
): Promise<ApiResponse<T>> => {
  const requestInfo = getApiRequestInfo(path);
  const startedAt = Date.now();
  const requestStartedAt = nowIso();
  const baseDiagnostics = () =>
    diagnostics({
      requestUrl: requestInfo.url,
      apiBaseUrl: requestInfo.apiBaseUrl,
      apiBaseUrlSource: requestInfo.apiBaseUrlSource,
      method,
      startedAt,
      requestStartedAt,
    });

  try {
    validateApiBaseUrl(requestInfo.apiBaseUrl);
  } catch (error) {
    throw createApiBaseUrlInvalidError(requestInfo.apiBaseUrl, {
      ...baseDiagnostics(),
      errorName: error instanceof Error ? error.name : undefined,
      errorMessage: error instanceof Error ? error.message : undefined,
    });
  }

  if (isMixedContent(requestInfo.url)) {
    throw createMixedContentError(baseDiagnostics());
  }

  const headers = new Headers({
    Accept: "application/json",
  });

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  for (const [key, value] of Object.entries(options.headers ?? {})) {
    headers.set(key, value);
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    response = await fetch(requestInfo.url, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const failureDiagnostics = diagnostics({
      requestUrl: requestInfo.url,
      apiBaseUrl: requestInfo.apiBaseUrl,
      apiBaseUrlSource: requestInfo.apiBaseUrlSource,
      method,
      startedAt,
      requestStartedAt,
      error,
      timeout: error instanceof DOMException && error.name === "AbortError",
    });

    if (shouldRetryStartupGet(method, path, attempt)) {
      await sleep(250);
      return request<T>(method, path, body, options, attempt + 1);
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw createTimeoutError(failureDiagnostics);
    }
    if (failureDiagnostics.mixedContentSuspected) {
      throw createMixedContentError(failureDiagnostics);
    }
    if (failureDiagnostics.corsSuspected) {
      throw createCorsBlockedError(failureDiagnostics);
    }
    throw createNetworkError(failureDiagnostics);
  } finally {
    window.clearTimeout(timeoutId);
  }

  return parseResponse<T>(response, {
    method,
    path,
    diagnostics: baseDiagnostics(),
  }, options);
};

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, body, options),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("DELETE", path, body, options),
  download: async (path: string) => {
    const headers = new Headers();

    const requestInfo = getApiRequestInfo(path);
    const response = await fetch(requestInfo.url, {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      const startedAt = Date.now();
      await parseResponse<never>(response, {
        method: "GET",
        path,
        diagnostics: diagnostics({
          requestUrl: requestInfo.url,
          apiBaseUrl: requestInfo.apiBaseUrl,
          apiBaseUrlSource: requestInfo.apiBaseUrlSource,
          method: "GET",
          startedAt,
          requestStartedAt: new Date(startedAt).toISOString(),
        }),
      });
    }

    return response.blob();
  },
};
