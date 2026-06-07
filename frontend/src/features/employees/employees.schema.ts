import { z } from "zod";

const employeeBaseSchema = z.object({
  employee_code: z.string().trim().nullable().optional(),
  full_name: z.string().trim().min(1, "Employee name is required."),
  employee_type: z.enum(["local", "foreign"]),
  primary_outlet_id: z.string().trim().min(1, "Primary outlet is required."),
  department_id: z.string().trim().nullable().optional(),
  position_id: z.string().trim().nullable().optional(),
  employment_status: z.enum(["active", "probation", "confirmed", "on_leave", "long_leave", "suspended", "resigned", "terminated", "retired", "inactive", "rehired", "archived"]),
  joined_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid joined date.").nullable().optional(),
  nationality: z.string().trim().nullable().optional(),
  id_card_number: z.string().trim().nullable().optional(),
  passport_number: z.string().trim().nullable().optional(),
  passport_expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid passport expiry date.").nullable().optional(),
  work_permit_number: z.string().trim().nullable().optional(),
  work_permit_expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid work permit expiry date.").nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  contract_type: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const identityRules = (value: z.infer<typeof employeeBaseSchema>, context: z.RefinementCtx) => {
  if (value.employee_type === "local" && !value.id_card_number) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["id_card_number"], message: "National ID number is required for local employees." });
  }
  if (value.employee_type === "foreign") {
    if (!value.nationality) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["nationality"], message: "Nationality is required for foreign employees." });
    }
    if (!value.passport_number) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["passport_number"], message: "Passport number is required for foreign employees." });
    }
    if (!value.passport_expiry_date) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["passport_expiry_date"], message: "Passport expiry date is required for foreign employees." });
    }
    if (!value.work_permit_number) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["work_permit_number"], message: "Work permit number is required for foreign employees." });
    }
    if (!value.work_permit_expiry_date) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["work_permit_expiry_date"], message: "Work permit expiry date is required for foreign employees." });
    }
  }
};

const startingSalarySchema = z.object({
  amount: z.coerce.number().int("Starting salary must be an integer amount in minor units.").positive("Starting salary is required."),
  salary_type: z.literal("monthly", { errorMap: () => ({ message: "Select a valid salary type." }) }).default("monthly"),
  currency: z.string().trim().default("MVR"),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid effective date."),
  reason: z.string().trim().nullable().optional(),
});

export const employeeCreateSchema = employeeBaseSchema.extend({
  starting_salary: startingSalarySchema,
}).superRefine((value, context) => identityRules(value, context));

export const employeeSchema = employeeCreateSchema;

export const employeeUpdateSchema = employeeBaseSchema
  .omit({ employee_code: true, primary_outlet_id: true, employment_status: true })
  .partial();

export type EmployeeFormValues = z.infer<typeof employeeCreateSchema>;
