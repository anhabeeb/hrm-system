import { getApiUrl } from "@/app/config";
import type { ApiErrorResponse, ApiResponse, StandardApiResponse } from "@/types/api";

import {
  ApiError,
  createInvalidApiResponseError,
  createNetworkError,
  createTimeoutError,
  friendlyMessageForStatus,
  handleSessionExpired,
} from "./api-errors";
import { getAuthToken } from "./auth-token";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  headers?: Record<string, string>;
  suppressSessionExpired?: boolean;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const parseResponse = async <T>(
  response: Response,
  requestMeta: { method: HttpMethod; path: string },
  options: RequestOptions = {},
): Promise<ApiResponse<T>> => {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as StandardApiResponse<T>)
    : null;

  if (!response.ok || !body || body.success === false) {
    if (!body) {
      const invalidError = createInvalidApiResponseError(response.status);
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
): Promise<ApiResponse<T>> => {
  const token = getAuthToken();
  const headers = new Headers({
    Accept: "application/json",
  });

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  for (const [key, value] of Object.entries(options.headers ?? {})) {
    headers.set(key, value);
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    response = await fetch(getApiUrl(path), {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw createTimeoutError();
    }
    throw createNetworkError();
  } finally {
    window.clearTimeout(timeoutId);
  }

  return parseResponse<T>(response, { method, path }, options);
};

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, body, options),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>("DELETE", path, body, options),
  download: async (path: string) => {
    const token = getAuthToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(getApiUrl(path), {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      await parseResponse<never>(response, { method: "GET", path });
    }

    return response.blob();
  },
};
