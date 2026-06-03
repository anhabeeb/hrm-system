import { z } from "zod";
import { isPositiveIntegerMinorUnits, isValidPayrollMonth } from "@/lib/hrm-errors";

export const salaryLoanSchema = z.object({
  employee_id: z.string().trim().min(1, "Employee is required."),
  loan_amount: z.coerce.number().refine(isPositiveIntegerMinorUnits, "Loan amount must be an integer minor unit value."),
  installment_amount: z.coerce.number().refine(isPositiveIntegerMinorUnits, "Installment amount must be an integer minor unit value."),
  start_month: z.string().trim().refine(isValidPayrollMonth, "Start month must use YYYY-MM."),
  reason: z.string().trim().min(3, "A reason is required for this action."),
});

export type SalaryLoanValues = z.infer<typeof salaryLoanSchema>;
