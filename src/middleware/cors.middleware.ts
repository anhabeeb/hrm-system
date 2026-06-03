import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { AppContext } from "../types/api.types";

export const ALLOWED_CORS_ORIGINS = [
  "https://hrm.cafeasiana.com.mv",
  "https://www.hrm.cafeasiana.com.mv",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
] as const;

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization, X-Request-ID";
const CORS_MAX_AGE = "86400";

export const getAllowedCorsOrigins = (env?: Pick<Env, "CORS_ALLOWED_ORIGINS">): string[] => {
  const configured = env?.CORS_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

  return Array.from(new Set([...ALLOWED_CORS_ORIGINS, ...configured]));
};

export const getCorsHeaders = (
  origin: string | null | undefined,
  env?: Pick<Env, "CORS_ALLOWED_ORIGINS">,
): HeadersInit => {
  if (!origin || !getAllowedCorsOrigins(env).includes(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Headers": CORS_HEADERS,
    "Access-Control-Max-Age": CORS_MAX_AGE,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
};

const applyCorsHeaders = (c: Context<AppContext>) => {
  const headers = getCorsHeaders(c.req.header("origin"), c.env);

  for (const [name, value] of Object.entries(headers)) {
    c.header(name, value);
  }

  return headers;
};

export const corsMiddleware = createMiddleware<AppContext>(async (c, next) => {
  const headers = applyCorsHeaders(c);

  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers,
    });
  }

  await next();
  applyCorsHeaders(c);
});
