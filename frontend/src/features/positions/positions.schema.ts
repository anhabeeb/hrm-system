import { z } from "zod";

export const positionSchema = z.object({
  title: z.string().trim().min(1, "Position title is required."),
  department_id: z.string().trim().min(1, "Department is required."),
  code: z.string().trim().nullable().optional(),
  description: z.string().trim().max(500, "Description is too long.").nullable().optional(),
  level: z.coerce.number().int().min(1, "Level must be between 1 and 4.").max(4, "Level must be between 1 and 4.").default(1),
  default_role_id: z.string().trim().nullable().optional(),
  can_manage_lower_levels: z.coerce.boolean().default(false),
  can_act_as_department_approver: z.coerce.boolean().default(false),
  default_salary_amount: z.coerce.number().int("Default salary must be stored as integer minor units.").nullable().optional(),
  status: z.enum(["active", "inactive", "disabled"]).default("active"),
});

export type PositionFormValues = z.infer<typeof positionSchema>;
