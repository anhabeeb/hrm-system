import { z } from "zod";

export const userSchema = z.object({
  full_name: z.string().trim().min(1, "User name is required."),
  email: z.string().trim().email("Please enter a valid email address."),
  status: z.string().trim().default("active"),
  role_ids: z.array(z.string()).default([]),
  outlet_ids: z.array(z.string()).default([]),
});

export type UserFormValues = z.infer<typeof userSchema>;
