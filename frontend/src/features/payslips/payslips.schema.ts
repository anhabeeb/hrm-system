import { z } from "zod";

export const generatePayslipsSchema = z.object({
  payroll_run_id: z.string().trim().min(1, "Payroll run is required."),
  outlet_id: z.string().trim().optional(),
  reason: z.string().trim().min(3, "A reason is required for this action."),
});

export type GeneratePayslipsValues = z.infer<typeof generatePayslipsSchema>;
