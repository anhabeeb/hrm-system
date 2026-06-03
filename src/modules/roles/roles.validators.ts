import { z } from "zod";

import type { RoleListFilters } from "./roles.types";
import { ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

export const validateRoleListFilters = (query: Record<string, string | undefined>): RoleListFilters =>
  parse(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
      search: z.string().trim().optional(),
      status: z.string().trim().optional(),
    }),
    query,
  );
