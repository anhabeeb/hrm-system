export interface AppErrorOptions {
  code: string;
  title?: string;
  message: string;
  statusCode?: number;
  retryable?: boolean;
  suggestedAction?: string;
  step?: string;
  fieldErrors?: Record<string, string>;
  details?: unknown;
  technicalMessage?: string;
  cause?: unknown;
}

const titleFromCode = (code: string): string =>
  code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export class AppError extends Error {
  public code: string;
  public statusCode: number;
  public title: string;
  public retryable: boolean;
  public suggestedAction?: string;
  public step?: string;
  public fieldErrors?: Record<string, string>;
  public details?: unknown;
  public technicalMessage?: string;
  public cause?: unknown;

  constructor(message: string, code: string, statusCode: number);
  constructor(options: AppErrorOptions);
  constructor(arg1: string | AppErrorOptions, code?: string, statusCode?: number) {
    const options =
      typeof arg1 === "string"
        ? {
            message: arg1,
            code: code ?? "UNKNOWN_ERROR",
            statusCode: statusCode ?? 500,
          }
        : arg1;

    super(options.message);
    this.name = new.target.name;
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.title = options.title ?? titleFromCode(options.code);
    this.retryable = options.retryable ?? this.statusCode >= 500;
    this.suggestedAction = options.suggestedAction;
    this.step = options.step;
    this.fieldErrors = options.fieldErrors;
    this.details = options.details;
    this.technicalMessage = options.technicalMessage;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  withStep(step: string): this {
    if (!this.step) this.step = step;
    return this;
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Some of the provided information is not valid. Please review the form and try again.",
    fieldErrors?: Record<string, string>,
  ) {
    super({
      message,
      code: "VALIDATION_ERROR",
      title: "Please review the form",
      statusCode: 400,
      retryable: false,
      fieldErrors,
      suggestedAction: "Review the highlighted fields and try again.",
    });
  }
}

export class AuthError extends AppError {
  constructor(message = "Please sign in to continue.", code = "AUTH_REQUIRED") {
    super({
      message,
      code,
      title: code === "INVALID_CREDENTIALS" ? "Invalid credentials" : "Authentication required",
      statusCode: 401,
      retryable: false,
      suggestedAction: "Sign in again, then retry the action.",
    });
  }
}

export class AuthenticationError extends AuthError {}

export class PermissionError extends AppError {
  constructor(
    message = "You do not have permission to perform this action.",
    code = "PERMISSION_DENIED",
  ) {
    super({
      message,
      code,
      title: "Permission denied",
      statusCode: 403,
      retryable: false,
      suggestedAction: "Ask an administrator to review your role or permissions.",
    });
  }
}

export class AuthorizationError extends PermissionError {}

export class FeatureDisabledError extends AppError {
  constructor(message = "This feature is currently disabled.") {
    super({
      message,
      code: "FEATURE_DISABLED",
      title: "Feature disabled",
      statusCode: 403,
      retryable: false,
      suggestedAction: "Enable the feature in Settings if this action should be available.",
    });
  }
}

export class OutletAccessError extends AppError {
  constructor(message = "You do not have access to this outlet.") {
    super({
      message,
      code: "OUTLET_ACCESS_DENIED",
      title: "Outlet access denied",
      statusCode: 403,
      retryable: false,
      suggestedAction: "Choose an outlet you can access or ask an administrator to update your outlet access.",
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested record could not be found.") {
    super({
      message,
      code: "NOT_FOUND",
      title: "Record not found",
      statusCode: 404,
      retryable: false,
    });
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "This action could not be completed because the record already exists or has changed.",
  ) {
    super({
      message,
      code: "CONFLICT",
      title: "Record conflict",
      statusCode: 409,
      retryable: false,
      suggestedAction: "Refresh the page, review the latest data, and try again.",
    });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please wait a moment and try again.") {
    super({
      message,
      code: "RATE_LIMITED",
      title: "Too many requests",
      statusCode: 429,
      retryable: true,
      suggestedAction: "Wait briefly, then retry the request.",
    });
  }
}

export class DatabaseError extends AppError {
  constructor(options: Omit<AppErrorOptions, "statusCode" | "title"> & { statusCode?: number; title?: string }) {
    super({
      title: "Database error",
      statusCode: 500,
      retryable: false,
      ...options,
    });
  }
}

export class ConfigurationError extends AppError {
  constructor(options: Omit<AppErrorOptions, "statusCode" | "title"> & { statusCode?: number; title?: string }) {
    super({
      title: "Configuration problem",
      statusCode: 500,
      retryable: false,
      suggestedAction: "Review the Worker environment bindings and secrets, then redeploy.",
      ...options,
    });
  }
}

export class ExternalServiceError extends AppError {
  constructor(options: Omit<AppErrorOptions, "statusCode" | "title"> & { statusCode?: number; title?: string }) {
    super({
      title: "External service unavailable",
      statusCode: 502,
      retryable: true,
      suggestedAction: "Try again. If the issue continues, check the external service status.",
      ...options,
    });
  }
}

export class StorageError extends AppError {
  constructor(options: Omit<AppErrorOptions, "statusCode" | "title"> & { statusCode?: number; title?: string }) {
    super({
      title: "Storage error",
      statusCode: 500,
      retryable: true,
      suggestedAction: "Try again. If the issue continues, check the storage bucket binding.",
      ...options,
    });
  }
}

export class RealtimeError extends AppError {
  constructor(options: Omit<AppErrorOptions, "statusCode" | "title"> & { statusCode?: number; title?: string }) {
    super({
      title: "Realtime service error",
      statusCode: 500,
      retryable: true,
      suggestedAction: "Try again. If the issue continues, check the realtime binding.",
      ...options,
    });
  }
}

export class UnknownAppError extends AppError {
  constructor(cause?: unknown, step?: string) {
    super({
      code: "UNKNOWN_ERROR",
      title: "Unexpected server error",
      message: "Something went wrong. Please try again or contact your system administrator.",
      statusCode: 500,
      retryable: true,
      suggestedAction: "Try again. If the issue continues, share the request ID with support.",
      cause,
      step,
    });
  }
}

export class LockedRecordError extends AppError {
  constructor(
    message = "This record cannot be changed because the payroll period is locked.",
  ) {
    super({
      message,
      code: "RECORD_LOCKED",
      title: "Record locked",
      statusCode: 423,
      retryable: false,
    });
  }
}

export class ReasonRequiredError extends AppError {
  constructor(message = "A reason is required for this action.") {
    super({
      message,
      code: "REASON_REQUIRED",
      title: "Reason required",
      statusCode: 400,
      retryable: false,
    });
  }
}

export class DeviceAuthError extends AppError {
  constructor(
    message = "Device authentication is required.",
    code = "DEVICE_AUTH_REQUIRED",
  ) {
    super({
      message,
      code,
      title: "Device authentication required",
      statusCode: 401,
      retryable: false,
    });
  }
}

export class ApprovalRequiredError extends AppError {
  constructor(message = "This action needs approval before it can continue.") {
    super({
      message,
      code: "APPROVAL_REQUIRED",
      title: "Approval required",
      statusCode: 409,
      retryable: false,
    });
  }
}

export class PayrollBlockedError extends AppError {
  constructor(
    message = "This payroll action is currently blocked. Please review the payroll status and try again.",
  ) {
    super({
      message,
      code: "PAYROLL_BLOCKED",
      title: "Payroll blocked",
      statusCode: 409,
      retryable: false,
    });
  }
}

export class SyncConflictError extends AppError {
  constructor(
    message = "This record was updated elsewhere. Refresh the page and try again.",
  ) {
    super({
      message,
      code: "SYNC_CONFLICT",
      title: "Sync conflict",
      statusCode: 409,
      retryable: false,
    });
  }
}
