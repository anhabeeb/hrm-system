import { z } from "zod";

import { POSITION_SORT_FIELDS, POSITION_STATUSES } from "./positions.constants";
import type { PositionFilters, PositionWriteInput } from "./positions.types";
import { ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};
const writeSchema = z.object({
  title: z.string().trim().min(1, "Position title is required."),
  department_id: z.string().trim().nullable().optional(),
  code: z.string().trim().nullable().optional(),
  default_salary_amount: z.number().int("Default salary must be stored as integer minor units.").nullable().optional(),
  status: z.enum(POSITION_STATUSES).default("active"),
});
export const validatePositionFilters = (query: Record<string, string | undefined>): PositionFilters =>
  parse(
    z.object({
      search: z.string().trim().optional(),
      department_id: z.string().trim().optional(),
      status: z.enum(POSITION_STATUSES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
      sort_by: z.enum(POSITION_SORT_FIELDS).default("created_at"),
      sort_direction: z.enum(["asc", "desc"]).default("desc"),
    }),
    query,
  );
export const validatePositionCreateInput = (payload: unknown): PositionWriteInput =>
  parse(writeSchema, payload);
export const validatePositionUpdateInput = (payload: unknown): Partial<PositionWriteInput> =>
  parse(writeSchema.partial(), payload);
