import type { Context } from "hono";

import type { AppContext } from "../types/api.types";
import { classifyError } from "../utils/error-classifier";
import { logAppError } from "../utils/error-logger";
import { appErrorResponse } from "../utils/response";
import { getCorsHeaders } from "./cors.middleware";

export const errorMiddleware = async (error: Error | unknown, c: Context<AppContext>) => {
  const requestId = c.get("requestId");
  const headers = getCorsHeaders(c.req.header("origin"));
  const appError = classifyError(error, {
    requestId,
    route: c.req.path,
    method: c.req.method,
  });

  await logAppError(c, appError, error);

  return appErrorResponse(appError, {
    headers,
    requestId,
    route: c.req.path,
    method: c.req.method,
  });
};
