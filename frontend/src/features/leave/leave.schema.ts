import { z } from "zod";

export const leaveRequestSchema = z.object({
  employee_id: z.string().trim().min(1, "Employee is required."),
  leave_type_id: z.string().trim().min(1, "Leave type is required."),
  start_date: z.string().trim().min(1, "Start date is required."),
  end_date: z.string().trim().min(1, "End date is required."),
  reason: z.string().trim().optional(),
}).refine((value) => !value.start_date || !value.end_date || value.start_date <= value.end_date, "Start date must be before or equal to end date.");

export const leaveBalanceAdjustmentSchema = z.object({
  employee_id: z.string().trim().min(1, "Employee is required."),
  leave_type_id: z.string().trim().min(1, "Leave type is required."),
  year: z.coerce.number().int().min(2000, "Please select a valid year."),
  adjustment_days: z.coerce.number(),
  reason: z.string().trim().min(3, "A reason is required for this action."),
});

export type LeaveRequestValues = z.infer<typeof leaveRequestSchema>;
export type LeaveBalanceAdjustmentValues = z.infer<typeof leaveBalanceAdjustmentSchema>;
