import { z } from "zod";

export const registerDeviceSchema = z.object({
  device_name: z.string().trim().min(1, "Device name is required."),
  outlet_id: z.string().trim().min(1, "Outlet is required."),
  device_type: z.string().trim().min(1, "Device type is required."),
  description: z.string().trim().optional(),
  allowed_ip: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

export const deviceReasonSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required."),
});

export type RegisterDeviceValues = z.infer<typeof registerDeviceSchema>;
export type DeviceReasonValues = z.infer<typeof deviceReasonSchema>;
