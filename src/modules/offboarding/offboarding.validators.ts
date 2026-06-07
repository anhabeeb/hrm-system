import { z } from "zod";

import {
  OFFBOARDING_CASE_STATUSES,
  OFFBOARDING_TYPES,
} from "./offboarding.constants";
import type {
  OffboardingActionInput,
  OffboardingListFilters,
  OffboardingStartInput,
  OffboardingUpdateInput,
} from "./offboarding.types";
import { ValidationError } from "../../utils/errors";

const safeString = z.string().trim().min(1).max(160);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.");
const optionalText = z.string().trim().max(2000).optional().nullable();

const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] = issue.message;
  }
  throw new ValidationError("Please review the offboarding form and try again.", fieldErrors);
};

const reasonSchema = z.string().trim().min(3, "A reason is required.").max(1000);

export const validateOffboardingStartInput = (input: unknown): OffboardingStartInput =>
  {
    const value = parse(
    z.object({
      offboarding_type: z.enum(OFFBOARDING_TYPES),
      effective_exit_date: dateString,
      reason: reasonSchema,
      notes: optionalText,
      create_default_tasks: z.coerce.boolean().default(true),
    }),
    input,
    );
    return { ...value, create_default_tasks: value.create_default_tasks ?? true };
  };

export const validateOffboardingUpdateInput = (input: unknown): OffboardingUpdateInput =>
  parse(
    z.object({
      notes: optionalText,
      status: z.enum(["draft", "in_progress", "pending_clearance"]).optional(),
    }).refine((value) => value.notes !== undefined || value.status !== undefined, {
      message: "Provide at least one field to update.",
      path: ["form"],
    }),
    input,
  );

export const validateOffboardingActionInput = (input: unknown, reasonRequired = true): OffboardingActionInput =>
  parse(
    z.object({
      reason: reasonRequired ? reasonSchema : z.string().trim().max(1000).optional(),
      notes: optionalText,
    }),
    input,
  );

export const validateOffboardingListFilters = (query: Record<string, unknown>): OffboardingListFilters =>
  {
    const value = parse(
    z.object({
      status: z.enum(OFFBOARDING_CASE_STATUSES).optional(),
      offboarding_type: z.enum(OFFBOARDING_TYPES).optional(),
      outlet_id: safeString.optional(),
      department_id: safeString.optional(),
      employee_id: safeString.optional(),
      date_from: dateString.optional(),
      date_to: dateString.optional(),
      page: z.coerce.number().int().positive().default(1),
      page_size: z.coerce.number().int().positive().max(100).default(25),
    }),
    query,
    );
    return { ...value, page: value.page ?? 1, page_size: value.page_size ?? 25 };
  };
