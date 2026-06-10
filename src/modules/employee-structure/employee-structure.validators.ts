import { z } from "zod";

import type { EmployeeStructureInput, LevelRoleTemplateFilters, LevelRoleTemplateInput } from "./employee-structure.types";
import { ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

const level = z.coerce.number().int().min(1, "Level must be between 1 and 4.").max(4, "Level must be between 1 and 4.");
const optionalId = z.string().trim().nullable().optional();

export const validateLevelRoleTemplateFilters = (query: Record<string, string | undefined>): LevelRoleTemplateFilters =>
  parse(
    z.object({
      level: level.optional(),
      department_id: z.string().trim().optional(),
      position_id: z.string().trim().optional(),
      role_id: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
    }),
    query,
  );

export const validateLevelRoleTemplateInput = (payload: unknown): LevelRoleTemplateInput =>
  parse(
    z.object({
      level,
      department_id: optionalId,
      position_id: optionalId,
      role_id: z.string().trim().min(1, "Role is required."),
      is_default: z.coerce.boolean().default(true),
      is_required: z.coerce.boolean().default(false),
    }),
    payload,
  );

export const validateLevelRoleTemplateUpdateInput = (payload: unknown): Partial<LevelRoleTemplateInput> =>
  parse(
    z.object({
      level: level.optional(),
      department_id: optionalId,
      position_id: optionalId,
      role_id: z.string().trim().min(1, "Role is required.").optional(),
      is_default: z.coerce.boolean().optional(),
      is_required: z.coerce.boolean().optional(),
    }),
    payload,
  );

export const validateEmployeeStructureInput = (payload: unknown): EmployeeStructureInput =>
  parse(
    z.object({
      department_id: z.string().trim().min(1, "Department is required."),
      position_id: z.string().trim().min(1, "Position is required."),
      reason: z.string().trim().max(500).nullable().optional(),
      effective_from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid effective date.").nullable().optional(),
    }),
    payload,
  );
