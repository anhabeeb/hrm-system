import { z } from "zod";
import { isPositiveIntegerMinorUnits, isValidPayrollMonth } from "@/lib/hrm-errors";

export const advanceSchema = z.object({
  employee_id: z.string().trim().min(1, "Employee is required."),
  amount: z.coerce.number().refine(isPositiveIntegerMinorUnits, "Amount must be an integer minor unit value."),
  paid_date: z.string().trim().min(1, "Advance date is required."),
  deduction_month: z.string().trim().refine(isValidPayrollMonth, "Deduction month must use YYYY-MM."),
  reason: z.string().trim().min(3, "A reason is required for this action."),
});

export type AdvanceValues = z.infer<typeof advanceSchema>;
