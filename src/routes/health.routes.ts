import { Hono } from "hono";

import { getRuntimeInfo } from "../config/env";
import type { AppContext } from "../types/api.types";
import { ok } from "../utils/response";

const healthRoutes = new Hono<AppContext>();

healthRoutes.get("/health", (c) =>
  ok(getRuntimeInfo(c.env), "HRM API is running", {
    requestId: c.get("requestId"),
  }),
);

export { healthRoutes };
