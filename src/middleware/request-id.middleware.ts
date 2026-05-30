import { createMiddleware } from "hono/factory";

import type { AppContext } from "../types/api.types";
import { createRequestId } from "../utils/ids";

export const requestIdMiddleware = createMiddleware<AppContext>(
  async (c, next) => {
    const incomingRequestId = c.req.header("x-request-id")?.trim();
    const requestId = incomingRequestId || createRequestId();

    c.set("requestId", requestId);

    await next();

    c.res.headers.set("x-request-id", requestId);
  },
);
