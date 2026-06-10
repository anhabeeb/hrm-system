import { z } from "zod";

export const departmentSchema = z.object({
  name: z.string().trim().min(1, "Department name is required."),
  code: z.string().trim().nullable().optional(),
  description: z.string().trim().max(500, "Description is too long.").nullable().optional(),
  head_employee_id: z.string().trim().nullable().optional(),
  day_to_day_management_min_level: z.coerce.number().int().min(1).max(4).default(3),
  status: z.enum(["active", "inactive", "disabled"]).default("active"),
});

export type DepartmentFormValues = z.infer<typeof departmentSchema>;
