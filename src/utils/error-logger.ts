import type { Context } from "hono";

import type { AppContext } from "../types/api.types";
import type { AppError } from "./errors";
import { sanitizeSensitivePayload, sanitizeSensitiveText } from "./sanitize";

const errorStack = (error: unknown): string | undefined =>
  error instanceof Error ? error.stack : undefined;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isProduction = (environment: string | undefined): boolean =>
  ["production", "prod"].includes((environment ?? "").toLowerCase());

const sanitizeMaybeText = (value: string | undefined | null): string | undefined =>
  value ? sanitizeSensitiveText(value) : undefined;

const shouldSuppressErrorDetails = (appError: AppError): boolean =>
  appError.statusCode === 401 || appError.statusCode === 403;

const safeStringify = (value: unknown): string | null => {
  try {
    const json = JSON.stringify(sanitizeSensitivePayload(value));
    return json ? sanitizeSensitiveText(json) : null;
  } catch {
    return null;
  }
};

export const sanitizedStackForEnvironment = (
  stack: string | undefined,
  environment: string | undefined,
): string | null => {
  if (!stack || isProduction(environment)) return null;
  return sanitizeSensitiveText(stack);
};

export const buildSanitizedErrorLogPayload = (
  input: {
    requestId?: string;
    environment?: string;
    route: string;
    method: string;
    userId?: string;
    companyId?: string;
    outletId?: string;
    deviceId?: string;
    appError: AppError;
    originalError: unknown;
  },
) => {
  const { appError, originalError } = input;
  return {
    requestId: input.requestId,
    timestamp: new Date().toISOString(),
    environment: input.environment ?? "unknown",
    route: input.route,
    method: input.method,
    userId: input.userId,
    companyId: input.companyId,
    outletId: input.outletId,
    deviceId: input.deviceId,
    error: {
      code: appError.code,
      title: sanitizeMaybeText(appError.title),
      message: sanitizeMaybeText(appError.message),
      technicalMessage: sanitizeMaybeText(appError.technicalMessage),
      step: sanitizeMaybeText(appError.step),
      status: appError.statusCode,
      retryable: appError.retryable,
      details: appError.details && !shouldSuppressErrorDetails(appError) ? safeStringify(appError.details) : undefined,
      originalMessage: sanitizeMaybeText(errorMessage(originalError)),
      stack: sanitizedStackForEnvironment(errorStack(originalError), input.environment),
      cause: appError.cause ? sanitizeMaybeText(errorMessage(appError.cause)) : undefined,
    },
  };
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
        sanitizeMaybeText(appError.message) ?? appError.message,
        sanitizeMaybeText(appError.technicalMessage) ?? null,
        sanitizeMaybeText(appError.step) ?? null,
        appError.statusCode,
        appError.retryable ? 1 : 0,
        sanitizedStackForEnvironment(errorStack(originalError), c.env.ENVIRONMENT) ?? null,
      )
      .run();
  } catch (loggingError) {
    console.warn("System error log write failed", {
      requestId: c.get("requestId"),
      route: c.req.path,
      method: c.req.method,
      error_message: sanitizeSensitiveText(errorMessage(loggingError)),
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
  const payload = buildSanitizedErrorLogPayload({
    requestId: c.get("requestId"),
    environment: c.env.ENVIRONMENT ?? "unknown",
    route: c.req.path,
    method: c.req.method,
    userId: authUser?.actorUserId,
    companyId: authUser?.companyId ?? deviceAuth?.companyId,
    outletId: deviceAuth?.outletId ?? (authUser?.outletIds.length === 1 ? authUser.outletIds[0] : undefined),
    deviceId: deviceAuth?.deviceId,
    appError,
    originalError,
  });

  console.error("Application request error", payload);
  await writeSystemErrorLogIfAvailable(c, appError, originalError);
};
