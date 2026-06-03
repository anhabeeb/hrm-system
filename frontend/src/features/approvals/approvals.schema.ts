import { z } from "zod";

export const approvalActionSchema = z.object({
  reason: z.string().trim().min(3, "A reason is required."),
  decision: z.enum(["approve", "reject"]).optional(),
});

export const workflowSchema = z.object({
  workflow_key: z.string().trim().min(1, "Workflow key is required."),
  workflow_name: z.string().trim().min(1, "Workflow name is required."),
  module: z.string().trim().min(1, "Module is required."),
  approval_mode: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

export const thresholdSchema = z.object({
  workflow_key: z.string().trim().min(1, "Workflow key is required."),
  threshold_name: z.string().trim().min(1, "Threshold name is required."),
  threshold_type: z.string().trim().min(1, "Threshold type is required."),
  amount_min: z.coerce.number().int().nonnegative().optional(),
  amount_max: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().trim().optional(),
  reason: z.string().trim().min(3, "A reason is required."),
});
