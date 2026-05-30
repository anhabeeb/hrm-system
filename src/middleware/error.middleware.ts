import type { Context } from "hono";

import { UNKNOWN_ERROR_MESSAGE } from "../config/constants";
import type { AppContext } from "../types/api.types";
import { AppError } from "../utils/errors";
import { errorResponse, serverError } from "../utils/response";

export const errorMiddleware = (error: Error | unknown, c: Context<AppContext>) => {
  const requestId = c.get("requestId");

  if (error instanceof AppError) {
    return errorResponse(error.statusCode, error.code, error.message, {
      requestId,
    });
  }

  console.error("Unhandled request error", {
    requestId,
    error,
  });

  return serverError(UNKNOWN_ERROR_MESSAGE, {
    requestId,
  });
};
