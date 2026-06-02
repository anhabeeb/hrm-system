import { getApiUrl } from "@/app/config";
import type { ApiErrorResponse, ApiResponse, StandardApiResponse } from "@/types/api";

import { ApiError, friendlyMessageForStatus, handleSessionExpired } from "./api-errors";
import { getAuthToken } from "./auth-token";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  headers?: Record<string, string>;
  suppressSessionExpired?: boolean;
}

const parseResponse = async <T>(response: Response, options: RequestOptions = {}): Promise<ApiResponse<T>> => {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as StandardApiResponse<T>)
    : null;

  if (!response.ok || !body || body.success === false) {
    const errorBody = body as ApiErrorResponse | null;
    const message = errorBody?.error?.message ?? friendlyMessageForStatus(response.status);
    const error = new ApiError(message, {
      code: errorBody?.error?.code ?? `HTTP_${response.status}`,
      status: response.status,
      requestId: errorBody?.request_id,
      details: "details" in (errorBody?.error ?? {}) ? (errorBody?.error as { details?: unknown }).details : undefined,
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
  try {
    response = await fetch(getApiUrl(path), {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Unable to connect to the server. Please check your connection and try again.", {
      code: "NETWORK_ERROR",
      status: 0,
    });
  }

  return parseResponse<T>(response, options);
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
      await parseResponse<never>(response);
    }

    return response.blob();
  },
};
