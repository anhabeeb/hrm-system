import { Hono } from "hono";

import { getEnvironment } from "../config/env";
import type { AppContext } from "../types/api.types";

const versionRoutes = new Hono<AppContext>();

const version = (env: Env): string => env.APP_VERSION?.trim() || "0.1.0";
const buildValue = (value: string | undefined): string => value?.trim() || "unknown";

versionRoutes.get("/", (c) =>
  Response.json(
    {
      success: true,
      service: "hrm-api",
      version: version(c.env),
      environment: getEnvironment(c.env),
      build: {
        source: "git",
        branch: buildValue(c.env.GIT_BRANCH),
        commit: buildValue(c.env.GIT_COMMIT_SHA),
        timestamp: buildValue(c.env.BUILD_TIMESTAMP),
      },
      features: {
        usersRoutes: true,
        rolesRoutes: true,
        permissionsRoutes: true,
        employeeIdentity: true,
        workerAssetsRouting: true,
      },
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

export { versionRoutes };
