import { Hono } from "hono";

import { getEnvironment } from "../config/env";
import type { AppContext } from "../types/api.types";

const healthRoutes = new Hono<AppContext>();

const version = (env: Env): string => env.APP_VERSION?.trim() || "0.1.0";

healthRoutes.get("/health", (c) =>
  Response.json(
    {
      success: true,
      status: "ok",
      service: "hrm-api",
      environment: getEnvironment(c.env),
      timestamp: new Date().toISOString(),
      version: version(c.env),
      requestId: c.get("requestId"),
      request_id: c.get("requestId"),
    },
    {
      status: 200,
      headers: {
        "x-request-id": c.get("requestId"),
      },
    },
  ),
);

healthRoutes.get("/health/deep", async (c) => {
  const checks = {
    db_binding: Boolean(c.env.DB),
    documents_bucket_binding: Boolean(c.env.DOCUMENTS_BUCKET),
    backup_bucket_binding: Boolean(c.env.BACKUP_BUCKET),
    realtime_room_binding: Boolean(c.env.REALTIME_ROOM),
    d1_query: false,
  };

  if (c.env.DB) {
    try {
      const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      checks.d1_query = row?.ok === 1;
    } catch {
      checks.d1_query = false;
    }
  }

  const status = checks.db_binding && checks.d1_query ? "ok" : "degraded";

  return Response.json(
    {
      success: true,
      status,
      service: "hrm-api",
      environment: getEnvironment(c.env),
      timestamp: new Date().toISOString(),
      version: version(c.env),
      requestId: c.get("requestId"),
      request_id: c.get("requestId"),
      checks,
    },
    {
      status: 200,
      headers: {
        "x-request-id": c.get("requestId"),
      },
    },
  );
});

export { healthRoutes };
