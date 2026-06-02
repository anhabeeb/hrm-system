import { z } from "zod";

const employeeBaseSchema = z.object({
  employee_code: z.string().trim().min(1, "Employee code is required."),
  full_name: z.string().trim().min(1, "Employee name is required."),
  employee_type: z.enum(["local", "foreign"]),
  primary_outlet_id: z.string().trim().min(1, "Primary outlet is required."),
  department_id: z.string().trim().nullable().optional(),
  position_id: z.string().trim().nullable().optional(),
  employment_status: z.enum(["active", "on_leave", "long_leave", "suspended", "resigned", "terminated", "archived"]),
  joined_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid joined date.").nullable().optional(),
  nationality: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  contract_type: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export const employeeSchema = employeeBaseSchema.superRefine((value, context) => {
  if (value.employee_type === "foreign" && !value.nationality) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["nationality"], message: "Nationality is required for foreign employees." });
  }
});

export const employeeUpdateSchema = employeeBaseSchema.omit({ primary_outlet_id: true, employment_status: true }).partial();

export type EmployeeFormValues = z.infer<typeof employeeSchema>;
