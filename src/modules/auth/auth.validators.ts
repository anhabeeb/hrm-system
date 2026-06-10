import { z } from "zod";

import {
  ALLOWED_KYC_REQUEST_TYPES,
  DISALLOWED_KYC_REQUEST_TYPES,
} from "./auth.constants";
import type {
  BackupCodeInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  KycUpdateRequestInput,
  LoginInput,
  ResetPasswordInput,
  TwoFactorDisableInput,
  TwoFactorChallengeVerifyInput,
  TwoFactorVerifyInput,
} from "./auth.types";
import { ValidationError } from "../../utils/errors";
import { validateNewPassword } from "../../services/password.service";

const emailSchema = z
  .string({
    required_error: "Email is required.",
  })
  .trim()
  .email("Please enter a valid email address.");

const loginIdentifierSchema = z
  .string({
    required_error: "Email or username is required.",
  })
  .trim()
  .min(1, "Email or username is required.");

const passwordSchema = z.string({
  required_error: "Password is required.",
});

const totpCodeSchema = z
  .string({
    required_error: "Please enter your Google Authenticator code.",
  })
  .trim()
  .regex(/^\d{6}$/, "Please enter the 6-digit Google Authenticator code.");

const parse = <T>(schema: z.ZodType<T>, payload: unknown): T => {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message);
  }

  return result.data;
};

export const validateLoginInput = (payload: unknown): LoginInput =>
  parse(
    z.object({
      email: loginIdentifierSchema.transform((value) => value.toLowerCase()),
      password: passwordSchema,
      totp_code: z.string().trim().optional(),
      backup_code: z.string().trim().optional(),
    }),
    payload,
  );

export const validateForgotPasswordInput = (
  payload: unknown,
): ForgotPasswordInput =>
  parse(
    z.object({
      email: emailSchema.transform((email) => email.toLowerCase()),
    }),
    payload,
  );

export const validateResetPasswordInput = (
  payload: unknown,
): ResetPasswordInput => {
  const input = parse(
    z.object({
      token: z.string().trim().min(1, "Reset token is required."),
      new_password: z.string().min(1, "New password is required."),
      confirm_password: z.string().min(1, "Please confirm the new password."),
    }),
    payload,
  );

  const passwordResult = validateNewPassword(
    input.new_password,
    input.confirm_password,
  );

  if (!passwordResult.valid) {
    throw new ValidationError(passwordResult.message);
  }

  return input;
};

export const validateChangePasswordInput = (
  payload: unknown,
): ChangePasswordInput => {
  const input = parse(
    z.object({
      current_password: z.string().min(1, "Current password is required."),
      new_password: z.string().min(1, "New password is required."),
      confirm_password: z.string().min(1, "Please confirm the new password."),
    }),
    payload,
  );

  const passwordResult = validateNewPassword(
    input.new_password,
    input.confirm_password,
  );

  if (!passwordResult.valid) {
    throw new ValidationError(passwordResult.message);
  }

  if (input.current_password === input.new_password) {
    throw new ValidationError("Please choose a new password you have not used here.");
  }

  return input;
};

export const validateTwoFactorVerifyInput = (
  payload: unknown,
): TwoFactorVerifyInput =>
  parse(
    z.object({
      code: totpCodeSchema,
    }),
    payload,
  );

export const validateTwoFactorChallengeVerifyInput = (
  payload: unknown,
): TwoFactorChallengeVerifyInput =>
  parse(
    z
      .object({
        challenge_id: z.string().trim().min(1, "Two-factor verification has expired. Please log in again."),
        code: z.string().trim().optional(),
        backup_code: z.string().trim().optional(),
      })
      .refine((value) => value.code || value.backup_code, {
        message: "Please enter your authenticator code.",
        path: ["code"],
      })
      .refine((value) => !value.code || /^\d{6}$/.test(value.code), {
        message: "Please enter the 6-digit Google Authenticator code.",
        path: ["code"],
      }),
    payload,
  );

export const validateTwoFactorDisableInput = (
  payload: unknown,
): TwoFactorDisableInput =>
  parse(
    z
      .object({
        password: z.string().optional(),
        code: z.string().trim().optional(),
      })
      .refine((value) => value.password || value.code, {
        message: "Please confirm with your password or Google Authenticator code.",
      }),
    payload,
  );

export const validateBackupCodeInput = (payload: unknown): BackupCodeInput =>
  parse(
    z.object({
      email: z.string().trim().email().optional(),
      backup_code: z.string().trim().min(1, "Backup code is required."),
    }),
    payload,
  );

export const validateKycUpdateRequestInput = (
  payload: unknown,
): KycUpdateRequestInput => {
  const input = parse(
    z.object({
      request_type: z.string().trim().min(1, "Request type is required."),
      requested_value_json: z.custom<unknown>().optional(),
      requested_changes: z.custom<unknown>().optional(),
      reason: z.string().trim().max(1000).optional(),
    }),
    payload,
  );
  const requestedValue = input.requested_value_json ?? input.requested_changes;

  if (DISALLOWED_KYC_REQUEST_TYPES.has(input.request_type)) {
    throw new ValidationError(
      "This type of change cannot be requested from My Profile.",
    );
  }

  if (!ALLOWED_KYC_REQUEST_TYPES.has(input.request_type)) {
    throw new ValidationError("Please choose a supported profile update type.");
  }

  if (requestedValue === undefined) {
    throw new ValidationError("Requested update details are required.");
  }

  return {
    request_type: input.request_type,
    requested_value_json: requestedValue,
    reason: input.reason,
  };
};
