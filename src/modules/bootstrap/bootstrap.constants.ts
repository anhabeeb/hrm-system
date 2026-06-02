export const BOOTSTRAP_MESSAGES = {
  required: "Initial setup is required.",
  completed: "Initial setup has already been completed.",
  success: "Initial setup completed successfully.",
  invalidToken: "Bootstrap token is invalid.",
  tokenNotConfigured: "Bootstrap token is not configured.",
  weakPassword: "Please use a stronger password.",
  roleMissing: "Super Admin role is missing. Please run the seed files first.",
} as const;

export const SEED_COMPANY_ID = "company_seed_default";
export const DEFAULT_COUNTRY = "MV";
export const DEFAULT_TIMEZONE = "Indian/Maldives";
export const DEFAULT_CURRENCY = "MVR";
