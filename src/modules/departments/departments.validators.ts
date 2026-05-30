import { z } from "zod";

import { DEPARTMENT_SORT_FIELDS, DEPARTMENT_STATUSES } from "./departments.constants";
import type { DepartmentFilters, DepartmentWriteInput } from "./departments.types";
import { ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};
const writeSchema = z.object({
  name: z.string().trim().min(1, "Department name is required."),
  code: z.string().trim().nullable().optional(),
  status: z.enum(DEPARTMENT_STATUSES).default("active"),
});
export const validateDepartmentFilters = (query: Record<string, string | undefined>): DepartmentFilters =>
  parse(
    z.object({
      search: z.string().trim().optional(),
      status: z.enum(DEPARTMENT_STATUSES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
      sort_by: z.enum(DEPARTMENT_SORT_FIELDS).default("created_at"),
      sort_direction: z.enum(["asc", "desc"]).default("desc"),
    }),
    query,
  );
export const validateDepartmentCreateInput = (payload: unknown): DepartmentWriteInput =>
  parse(writeSchema, payload);
export const validateDepartmentUpdateInput = (payload: unknown): Partial<DepartmentWriteInput> =>
  parse(writeSchema.partial(), payload);
