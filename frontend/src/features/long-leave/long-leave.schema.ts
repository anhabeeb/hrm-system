import { z } from "zod";

export const longLeaveSchema = z.object({
  employee_id: z.string().trim().min(1, "Employee is required."),
  leave_request_id: z.string().trim().min(1, "Leave request is required."),
  start_date: z.string().trim().min(1, "Start date is required."),
  expected_return_date: z.string().trim().min(1, "Expected return date is required."),
  reason: z.string().trim().min(3, "A reason is required for this action."),
}).refine((value) => value.expected_return_date >= value.start_date, "Expected return date must be after the start date.");

export type LongLeaveValues = z.infer<typeof longLeaveSchema>;
