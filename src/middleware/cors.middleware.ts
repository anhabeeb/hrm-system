import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { AppContext } from "../types/api.types";

export const ALLOWED_CORS_ORIGINS = [
  "https://hrm.cafeasiana.com.mv",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
] as const;

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization";
const CORS_MAX_AGE = "86400";

export const getCorsHeaders = (origin: string | null | undefined): HeadersInit => {
  if (!origin || !ALLOWED_CORS_ORIGINS.includes(origin as (typeof ALLOWED_CORS_ORIGINS)[number])) {
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
  const headers = getCorsHeaders(c.req.header("origin"));

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
