import type { Context } from "hono";

import type { AppContext } from "../types/api.types";
import type { AppError } from "./errors";

const errorStack = (error: unknown): string | undefined =>
  error instanceof Error ? error.stack : undefined;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const safeStringify = (value: unknown): string | null => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const writeSystemErrorLogIfAvailable = async (
  c: Context<AppContext>,
  appError: AppError,
  originalError: unknown,
): Promise<void> => {
  const db = c.env.DB;
  if (!db) return;

  try {
    const table = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'system_error_logs'")
      .first<{ name: string }>();
    if (!table) return;

    const authUser = c.get("authUser");
    await db
      .prepare(
        `INSERT INTO system_error_logs (
          id,
          request_id,
          environment,
          route,
          method,
          user_id,
          company_id,
          code,
          title,
          message,
          technical_message,
          step,
          status,
          retryable,
          stack_trace,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .bind(
        crypto.randomUUID(),
        c.get("requestId"),
        c.env.ENVIRONMENT ?? "unknown",
        c.req.path,
        c.req.method,
        authUser?.actorUserId ?? null,
        authUser?.companyId ?? null,
        appError.code,
        appError.title,
        appError.message,
        appError.technicalMessage ?? null,
        appError.step ?? null,
        appError.statusCode,
        appError.retryable ? 1 : 0,
        errorStack(originalError) ?? null,
      )
      .run();
  } catch (loggingError) {
    console.warn("System error log write failed", {
      requestId: c.get("requestId"),
      route: c.req.path,
      method: c.req.method,
      error_message: errorMessage(loggingError),
    });
  }
};

export const logAppError = async (
  c: Context<AppContext>,
  appError: AppError,
  originalError: unknown,
): Promise<void> => {
  const authUser = c.get("authUser");
  const deviceAuth = c.get("deviceAuth");
  const payload = {
    requestId: c.get("requestId"),
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT ?? "unknown",
    route: c.req.path,
    method: c.req.method,
    userId: authUser?.actorUserId,
    companyId: authUser?.companyId ?? deviceAuth?.companyId,
    outletId: deviceAuth?.outletId ?? (authUser?.outletIds.length === 1 ? authUser.outletIds[0] : undefined),
    deviceId: deviceAuth?.deviceId,
    error: {
      code: appError.code,
      title: appError.title,
      message: appError.message,
      technicalMessage: appError.technicalMessage,
      step: appError.step,
      status: appError.statusCode,
      retryable: appError.retryable,
      details: appError.details ? safeStringify(appError.details) : undefined,
      stack: errorStack(originalError),
      cause: appError.cause ? errorMessage(appError.cause) : undefined,
    },
  };

  console.error("Application request error", payload);
  await writeSystemErrorLogIfAvailable(c, appError, originalError);
};
