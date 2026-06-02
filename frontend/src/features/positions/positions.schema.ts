import { z } from "zod";

export const positionSchema = z.object({
  title: z.string().trim().min(1, "Position title is required."),
  department_id: z.string().trim().nullable().optional(),
  code: z.string().trim().nullable().optional(),
  default_salary_amount: z.coerce.number().int("Default salary must be stored as integer minor units.").nullable().optional(),
  status: z.enum(["active", "inactive", "disabled"]).default("active"),
});

export type PositionFormValues = z.infer<typeof positionSchema>;
