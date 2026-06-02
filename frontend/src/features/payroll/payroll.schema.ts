import { z } from "zod";
import { isValidPayrollMonth } from "@/lib/hrm-errors";

export const payrollRunSchema = z.object({
  payroll_month: z.string().trim().refine(isValidPayrollMonth, "Payroll month must use YYYY-MM."),
  outlet_id: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

export type PayrollRunValues = z.infer<typeof payrollRunSchema>;
