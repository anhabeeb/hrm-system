import type { Context } from "hono";

import type { AppContext } from "../types/api.types";
import { classifyError } from "../utils/error-classifier";
import { logAppError } from "../utils/error-logger";
import { appErrorResponse } from "../utils/response";
import { getCorsHeaders } from "./cors.middleware";
import { getSecurityHeaders } from "./security.middleware";
import { buildClearSessionCookie } from "../services/session.service";

export const errorMiddleware = async (error: Error | unknown, c: Context<AppContext>) => {
  const requestId = c.get("requestId");
  const headers: Record<string, string> = {
    ...getCorsHeaders(c.req.header("origin"), c.env),
    ...getSecurityHeaders(c.req.path),
  };
  const appError = classifyError(error, {
    requestId,
    route: c.req.path,
    method: c.req.method,
  });

  await logAppError(c, appError, error);

  if (appError.code === "SESSION_EXPIRED") {
    headers["Set-Cookie"] = buildClearSessionCookie();
  }

  return appErrorResponse(appError, {
    headers,
    requestId,
    route: c.req.path,
    method: c.req.method,
  });
};
