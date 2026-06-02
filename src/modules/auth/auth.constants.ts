export const SESSION_COOKIE_NAME = "hrm_session";
export const SESSION_TTL_DAYS = 7;
export const PASSWORD_RESET_TTL_MINUTES = 30;
export const FAILED_LOGIN_LIMIT = 5;
export const ACCOUNT_LOCK_MINUTES = 15;
export const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
export const PASSWORD_HASH_DIGEST = "SHA-256";
export const PASSWORD_HASH_VERSION = "v1";
export const PBKDF2_MAX_WORKERS_ITERATIONS = 100_000;
export const PASSWORD_HASH_ITERATIONS = 100_000;
export const TOTP_ISSUER = "HRM System";
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
export const BACKUP_CODE_COUNT = 10;

export const LOGIN_ERROR_MESSAGE = "The email or password is incorrect.";
export const LOCKED_ACCOUNT_MESSAGE =
  "Your account is locked. Please try again later or contact your system administrator.";
export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please log in again.";

export const DISALLOWED_KYC_REQUEST_TYPES = new Set([
  "role",
  "role_update",
  "permission",
  "permission_update",
  "outlet_access",
  "outlet_access_update",
  "salary",
  "salary_update",
  "payroll",
  "payroll_update",
  "attendance",
  "attendance_update",
]);

export const ALLOWED_KYC_REQUEST_TYPES = new Set([
  "name_update",
  "phone_update",
  "email_update",
  "address_update",
  "emergency_contact_update",
  "id_card_update",
  "passport_update",
  "visa_update",
  "work_permit_update",
  "bank_info_update",
  "profile_photo_update",
  "document_update",
]);
