export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Some of the provided information is not valid. Please review the form and try again.",
  ) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class AuthError extends AppError {
  constructor(message = "Please sign in to continue.", code = "AUTH_REQUIRED") {
    super(message, code, 401);
  }
}

export class PermissionError extends AppError {
  constructor(
    message = "You do not have permission to perform this action.",
    code = "PERMISSION_DENIED",
  ) {
    super(message, code, 403);
  }
}

export class FeatureDisabledError extends AppError {
  constructor(message = "This feature is currently disabled.") {
    super(message, "FEATURE_DISABLED", 403);
  }
}

export class OutletAccessError extends AppError {
  constructor(message = "You do not have access to this outlet.") {
    super(message, "OUTLET_ACCESS_DENIED", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested record could not be found.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "This action could not be completed because the record already exists or has changed.",
  ) {
    super(message, "CONFLICT", 409);
  }
}

export class LockedRecordError extends AppError {
  constructor(
    message = "This record cannot be changed because the payroll period is locked.",
  ) {
    super(message, "RECORD_LOCKED", 423);
  }
}

export class ReasonRequiredError extends AppError {
  constructor(message = "A reason is required for this action.") {
    super(message, "REASON_REQUIRED", 400);
  }
}

export class DeviceAuthError extends AppError {
  constructor(
    message = "Device authentication is required.",
    code = "DEVICE_AUTH_REQUIRED",
  ) {
    super(message, code, 401);
  }
}

export class ApprovalRequiredError extends AppError {
  constructor(message = "This action needs approval before it can continue.") {
    super(message, "APPROVAL_REQUIRED", 409);
  }
}

export class PayrollBlockedError extends AppError {
  constructor(
    message = "This payroll action is currently blocked. Please review the payroll status and try again.",
  ) {
    super(message, "PAYROLL_BLOCKED", 409);
  }
}

export class SyncConflictError extends AppError {
  constructor(
    message = "This record was updated elsewhere. Refresh the page and try again.",
  ) {
    super(message, "SYNC_CONFLICT", 409);
  }
}
