import { z } from "zod";

export const biometricDeviceSchema = z.object({
  outlet_id: z.string().trim().min(1, "Outlet is required."),
  device_name: z.string().trim().min(1, "Device name is required."),
  device_serial: z.string().trim().optional(),
  device_type: z.string().trim().min(1, "Device type is required."),
  sync_mode: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

export const biometricMappingSchema = z.object({
  employee_id: z.string().trim().min(1, "Employee is required."),
  device_id: z.string().trim().min(1, "Device is required."),
  biometric_user_id: z.string().trim().min(1, "Biometric user ID is required."),
  enrollment_status: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

export const biometricReasonSchema = z.object({
  employee_id: z.string().trim().optional(),
  reason: z.string().trim().min(1, "Reason is required."),
});

export type BiometricDeviceValues = z.infer<typeof biometricDeviceSchema>;
export type BiometricMappingValues = z.infer<typeof biometricMappingSchema>;
export type BiometricReasonValues = z.infer<typeof biometricReasonSchema>;
