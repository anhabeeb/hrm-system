import {
  AppError,
  ConfigurationError,
  DatabaseError,
  RealtimeError,
  StorageError,
  UnknownAppError,
} from "./errors";
import { sanitizeSensitiveText } from "./sanitize";

export interface ErrorClassificationContext {
  requestId?: string;
  route?: string;
  method?: string;
  step?: string;
}

export const sanitizeTechnicalMessage = (message: string): string =>
  sanitizeSensitiveText(message, { mask: "[redacted]" });

const getMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const withContext = <T extends AppError>(error: T, context: ErrorClassificationContext): T => {
  if (context.step && !error.step) error.withStep(context.step);
  return error;
};

const databaseError = (options: {
  code: string;
  title: string;
  message: string;
  technicalMessage: string;
  suggestedAction?: string;
  retryable?: boolean;
  statusCode?: number;
  cause: unknown;
}) =>
  new DatabaseError({
    ...options,
    retryable: options.retryable ?? false,
  });

export const classifyError = (
  error: unknown,
  context: ErrorClassificationContext = {},
): AppError => {
  if (error instanceof AppError) {
    return withContext(error, context);
  }

  const rawMessage = getMessage(error);
  const technicalMessage = sanitizeTechnicalMessage(rawMessage);
  const lower = rawMessage.toLowerCase();

  if (/pbkdf2 failed: iteration counts above 100000 are not supported/i.test(rawMessage)) {
    return withContext(
      new ConfigurationError({
        code: "PASSWORD_HASH_CONFIGURATION_ERROR",
        title: "Password hashing configuration error",
        message: "The password could not be securely hashed because the configured PBKDF2 iteration count is not supported by the current runtime.",
        technicalMessage,
        suggestedAction: "Set PASSWORD_HASH_ITERATIONS to 100000 or lower for Cloudflare Workers, then retry.",
        retryable: false,
        cause: error,
      }),
      context,
    );
  }

  const missingTableMatch = rawMessage.match(/no such table:\s*([a-zA-Z0-9_]+)/i);
  if (missingTableMatch) {
    return withContext(
      databaseError({
        code: "DATABASE_MISSING_TABLE",
        title: "Database schema is incomplete",
        message: "A required database table is missing.",
        technicalMessage: `no such table: ${missingTableMatch[1]}`,
        suggestedAction: "Apply the latest D1 migrations to the remote database, then try again.",
        cause: error,
      }),
      context,
    );
  }

  const missingColumnMatch = rawMessage.match(/no such column:\s*([a-zA-Z0-9_.]+)/i);
  if (missingColumnMatch) {
    return withContext(
      databaseError({
        code: "DATABASE_MISSING_COLUMN",
        title: "Database schema is out of date",
        message: "A required database column is missing.",
        technicalMessage: `no such column: ${missingColumnMatch[1]}`,
        suggestedAction: "Apply the latest D1 migrations to the remote database, then try again.",
        cause: error,
      }),
      context,
    );
  }

  if (/unique constraint failed/i.test(rawMessage)) {
    return withContext(
      databaseError({
        code: "DATABASE_CONSTRAINT_FAILED",
        title: "Duplicate record",
        message: "A record with the same unique value already exists.",
        technicalMessage,
        suggestedAction: "Review the duplicate value and try again.",
        statusCode: 409,
        cause: error,
      }),
      context,
    );
  }

  if (/(foreign key constraint failed|not null constraint failed|check constraint failed|constraint failed)/i.test(rawMessage)) {
    return withContext(
      databaseError({
        code: "DATABASE_CONSTRAINT_FAILED",
        title: "Database constraint failed",
        message: "The request could not be saved because required related data is missing or invalid.",
        technicalMessage,
        suggestedAction: "Review the submitted values and try again.",
        statusCode: 409,
        cause: error,
      }),
      context,
    );
  }

  if (/(syntax error|near ".+": syntax error|sql error)/i.test(rawMessage)) {
    return withContext(
      databaseError({
        code: "DATABASE_QUERY_FAILED",
        title: "Database query failed",
        message: "The database query could not be completed.",
        technicalMessage,
        suggestedAction: "Share the request ID with support so the query can be reviewed.",
        cause: error,
      }),
      context,
    );
  }

  if (/(d1.*timeout|database.*timeout|query.*timeout|timed out)/i.test(rawMessage)) {
    return withContext(
      databaseError({
        code: "DATABASE_TIMEOUT",
        title: "Database timeout",
        message: "The database took too long to respond.",
        technicalMessage,
        suggestedAction: "Try again. If the issue continues, check D1 service health.",
        retryable: true,
        cause: error,
      }),
      context,
    );
  }

  if (/(db binding|database binding|cannot read properties of undefined.*prepare|undefined.*db|missing.*binding)/i.test(rawMessage)) {
    return withContext(
      new ConfigurationError({
        code: "CONFIG_MISSING_BINDING",
        title: "Cloudflare binding is missing",
        message: "A required Cloudflare binding is not configured.",
        technicalMessage,
        cause: error,
      }),
      context,
    );
  }

  if (/(internal_secret|jwt.*secret|session.*secret|secret.*missing|missing.*secret|environment variable.*missing)/i.test(rawMessage)) {
    return withContext(
      new ConfigurationError({
        code: "CONFIG_MISSING_SECRET",
        title: "Required secret is missing",
        message: "A required Worker secret or environment value is not configured.",
        technicalMessage,
        cause: error,
      }),
      context,
    );
  }

  if (/(r2|bucket|object storage|storage)/i.test(rawMessage)) {
    return withContext(
      new StorageError({
        code: lower.includes("not found") ? "STORAGE_FILE_NOT_FOUND" : "STORAGE_UPLOAD_FAILED",
        message: lower.includes("not found")
          ? "The requested file could not be found."
          : "The file storage operation could not be completed.",
        technicalMessage,
        cause: error,
      }),
      context,
    );
  }

  if (/(durable object|websocket|realtime|room|hub)/i.test(rawMessage)) {
    return withContext(
      new RealtimeError({
        code: lower.includes("publish") ? "REALTIME_PUBLISH_FAILED" : "REALTIME_UNAVAILABLE",
        message: "Realtime updates are temporarily unavailable.",
        technicalMessage,
        cause: error,
      }),
      context,
    );
  }

  const unknown = new UnknownAppError(error, context.step);
  unknown.technicalMessage = technicalMessage || undefined;
  return unknown;
};
