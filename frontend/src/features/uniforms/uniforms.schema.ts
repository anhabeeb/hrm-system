import { z } from "zod";

export const uniformIssueSchema = z.object({
  employee_id: z.string().trim().min(1, "Employee is required."),
  outlet_id: z.string().trim().optional(),
  uniform_type: z.string().trim().min(1, "Uniform type is required."),
  quantity: z.coerce.number().int("Quantity must be a whole number.").positive("Quantity must be greater than zero."),
  issued_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Issue date must use YYYY-MM-DD."),
  reason: z.string().trim().optional(),
});

export const uniformReturnSchema = z.object({
  returned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Return date must use YYYY-MM-DD."),
  reason: z.string().trim().min(3, "A reason is required."),
});
