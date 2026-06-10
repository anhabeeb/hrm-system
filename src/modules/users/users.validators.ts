import { z } from "zod";

import type {
  UserCreateInput,
  UserListFilters,
  UserReasonInput,
  UserRoleAssignmentInput,
  UserUpdateInput,
} from "./users.types";
import { AppError, ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const fieldErrors = Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join(".") || "form", issue.message]),
    );
    throw new ValidationError(result.error.issues[0]?.message, fieldErrors);
  }
  return result.data;
};

const safeIdArray = z.array(z.string().trim().min(1)).default([]);
const reason = z.string().trim().min(3, "A reason is required for this action.");
const email = z.string().trim().email("A valid email is required.").transform((value) => value.toLowerCase());
const username = z.string().trim().min(3, "Username must be at least 3 characters.").max(80, "Username must be 80 characters or fewer.").regex(/^[a-zA-Z0-9._-]+$/, "Username may contain letters, numbers, dots, underscores, and hyphens.");
const userStatus = z.enum(["active", "inactive", "disabled", "invite_pending", "password_reset_required"]);

const assertNoSensitiveFields = (payload: unknown) => {
  const raw = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const blocked = [
    "password",
    "password_hash",
    "password_algo",
    "password_salt",
    "token",
    "session_token_hash",
    "totp_secret",
    "backup_codes_hash_json",
  ];
  const present = blocked.find((field) => field in raw);
  if (present) {
    throw new AppError({
      code: "SENSITIVE_AUTH_FIELD_NOT_ALLOWED",
      message: "Password and security fields cannot be changed through this endpoint.",
      statusCode: 400,
      retryable: false,
    });
  }
};

export const validateUserListFilters = (query: Record<string, string | undefined>): UserListFilters =>
  parse(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
      search: z.string().trim().optional(),
      status: z.string().trim().optional(),
      role_id: z.string().trim().optional(),
      outlet_id: z.string().trim().optional(),
    }),
    query,
  );

export const validateUserCreateInput = (payload: unknown): UserCreateInput => {
  assertNoSensitiveFields(payload);
  return parse(
    z.object({
      full_name: z.string().trim().min(1, "Full name is required."),
      username: username.nullable().optional(),
      email,
      employee_id: z.string().trim().min(1).nullable().optional(),
      status: userStatus.default("active"),
      role_ids: safeIdArray,
      outlet_ids: safeIdArray,
    }),
    payload,
  );
};

export const validateUserUpdateInput = (payload: unknown): UserUpdateInput => {
  assertNoSensitiveFields(payload);
  return parse(
    z.object({
      full_name: z.string().trim().min(1, "Full name is required.").optional(),
      username: username.nullable().optional(),
      email: email.optional(),
      employee_id: z.string().trim().min(1).nullable().optional(),
      status: userStatus.optional(),
      role_ids: safeIdArray.optional(),
      outlet_ids: safeIdArray.optional(),
    }),
    payload,
  );
};

export const validateUserReasonInput = (payload: unknown): UserReasonInput =>
  parse(z.object({ reason }), payload);

export const validateUserRoleAssignmentInput = (payload: unknown): UserRoleAssignmentInput =>
  parse(z.object({ role_ids: safeIdArray, reason }), payload);
