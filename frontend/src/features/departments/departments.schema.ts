import { z } from "zod";

export const departmentSchema = z.object({
  name: z.string().trim().min(1, "Department name is required."),
  code: z.string().trim().nullable().optional(),
  status: z.enum(["active", "inactive", "disabled"]).default("active"),
});

export type DepartmentFormValues = z.infer<typeof departmentSchema>;
