import { z } from "zod";

export const outletSchema = z.object({
  name: z.string().trim().min(1, "Outlet name is required."),
  code: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  status: z.enum(["active", "inactive", "disabled"]).default("active"),
});

export type OutletFormValues = z.infer<typeof outletSchema>;
