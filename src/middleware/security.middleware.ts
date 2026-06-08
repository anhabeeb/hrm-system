import { createMiddleware } from "hono/factory";

import type { AppContext } from "../types/api.types";
import { AppError } from "../utils/errors";
import { getAllowedCorsOrigins } from "./cors.middleware";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const simpleUnsafeContentTypes = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
];

export const getSecurityHeaders = (path = ""): HeadersInit => {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };

  if (path.startsWith("/api/")) {
    headers["Cache-Control"] = "private, no-store";
  }

  return headers;
};

const applySecurityHeaders = (headers: Headers, path: string) => {
  for (const [name, value] of Object.entries(getSecurityHeaders(path))) {
    if (!headers.has(name)) headers.set(name, value);
  }
};

const isDeviceTokenRequest = (path: string, authorization?: string | null, deviceToken?: string | null) =>
  (path.startsWith("/api/v1/kiosk") || path.startsWith("/api/v1/sync")) &&
  (authorization?.toLowerCase().startsWith("bearer ") || Boolean(deviceToken));

const hasRequestBody = (contentLength?: string | null, transferEncoding?: string | null) =>
  Boolean(transferEncoding) || (contentLength !== undefined && contentLength !== null && Number(contentLength) > 0);

export const securityHeadersMiddleware = createMiddleware<AppContext>(async (c, next) => {
  await next();
  applySecurityHeaders(c.res.headers, c.req.path);
});

export const unsafeRequestGuardMiddleware = createMiddleware<AppContext>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = c.req.path;

  if (!path.startsWith("/api/") || !unsafeMethods.has(method)) {
    await next();
    return;
  }

  if (isDeviceTokenRequest(path, c.req.header("authorization"), c.req.header("x-device-token"))) {
    await next();
    return;
  }

  const origin = c.req.header("origin");
  if (origin && !getAllowedCorsOrigins(c.env).includes(origin)) {
    throw new AppError({
      code: "CSRF_ORIGIN_DENIED",
      title: "Request origin not allowed",
      message: "This request origin is not allowed.",
      statusCode: 403,
      retryable: false,
    });
  }

  const contentType = c.req.header("content-type")?.toLowerCase() ?? "";
  if (
    hasRequestBody(c.req.header("content-length"), c.req.header("transfer-encoding")) &&
    simpleUnsafeContentTypes.some((type) => contentType.startsWith(type))
  ) {
    throw new AppError({
      code: "UNSAFE_CONTENT_TYPE",
      title: "Unsafe request content type",
      message: "Please send mutating API requests as application/json.",
      statusCode: 415,
      retryable: false,
    });
  }

  await next();
});
