import { z } from "zod";

import {
  ALLOWED_PROFILE_UPDATE_REQUEST_TYPES,
  BLOCKED_PROFILE_UPDATE_REQUEST_TYPES,
  PROFILE_UPDATE_REQUEST_STATUSES,
} from "./profile-update-requests.constants";
import type { ProfileUpdateRequestFilters, ReviewInput } from "./profile-update-requests.types";
import { ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

export const validateProfileUpdateRequestFilters = (
  query: Record<string, string | undefined>,
): ProfileUpdateRequestFilters =>
  parse(
    z.object({
      status: z.enum(PROFILE_UPDATE_REQUEST_STATUSES).optional(),
      request_type: z.enum(ALLOWED_PROFILE_UPDATE_REQUEST_TYPES).optional(),
      user_id: z.string().trim().optional(),
      employee_id: z.string().trim().optional(),
      date_from: z.string().trim().optional(),
      date_to: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
      sort_by: z.enum(["created_at", "updated_at", "status", "request_type"]).default("created_at"),
      sort_direction: z.enum(["asc", "desc"]).default("desc"),
    }),
    query,
  );

export const validateReviewInput = (payload: unknown): ReviewInput => {
  const input = parse(
    z.object({
      reason: z.string().trim().optional(),
      review_notes: z.string().trim().optional(),
    }),
    payload,
  );
  const message = input.review_notes || input.reason;

  if (!message || message.trim().length < 3) {
    throw new ValidationError("A reason is required for this action.");
  }

  return {
    reason: input.reason || message,
    review_notes: input.review_notes || message,
  };
};

export const assertAllowedRequestType = (requestType: string) => {
  if ((BLOCKED_PROFILE_UPDATE_REQUEST_TYPES as readonly string[]).includes(requestType)) {
    throw new ValidationError("This type of profile update cannot be requested here.");
  }

  if (!(ALLOWED_PROFILE_UPDATE_REQUEST_TYPES as readonly string[]).includes(requestType)) {
    throw new ValidationError("Please choose a valid profile update request type.");
  }
};
