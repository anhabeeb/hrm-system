import { z } from "zod";

export const manualAttendanceSchema = z
  .object({
    employee_id: z.string().trim().min(1, "Employee is required."),
    attendance_date: z.string().trim().min(1, "Attendance date is required."),
    clock_in_time: z.string().trim().optional(),
    clock_out_time: z.string().trim().optional(),
    status: z.string().trim().optional(),
    reason: z.string().trim().min(1, "Reason is required."),
    note: z.string().trim().optional(),
  })
  .refine((value) => Boolean(value.clock_in_time || value.clock_out_time || value.status), "Enter at least one clock time or status.");

export const correctionRequestSchema = z.object({
  employee_id: z.string().trim().min(1, "Employee is required."),
  attendance_date: z.string().trim().min(1, "Attendance date is required."),
  correction_type: z.string().trim().min(1, "Correction type is required."),
  requested_clock_in: z.string().trim().optional(),
  requested_clock_out: z.string().trim().optional(),
  reason: z.string().trim().min(1, "Reason is required."),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required."),
  resolution: z.string().trim().optional(),
  resolution_notes: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type ManualAttendanceValues = z.infer<typeof manualAttendanceSchema>;
export type CorrectionRequestValues = z.infer<typeof correctionRequestSchema>;
export type ReasonValues = z.infer<typeof reasonSchema>;
