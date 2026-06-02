import { z } from "zod";

const optionalMonth = z.string().regex(/^\d{4}-\d{2}$/, "Month must use YYYY-MM.").optional().or(z.literal(""));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD.");
const money = z.coerce.number().int("Amount must be integer minor units.").positive("Amount must be greater than zero.");

export const assetSchema = z.object({
  asset_code: z.string().trim().min(1, "Asset code is required."),
  asset_name: z.string().trim().min(1, "Asset name is required."),
  asset_type: z.string().trim().min(1, "Asset type is required."),
  outlet_id: z.string().trim().optional(),
  purchase_value_amount: money.optional(),
  current_condition: z.string().trim().optional(),
});

export const assetAssignSchema = z.object({
  employee_id: z.string().trim().optional(),
  outlet_id: z.string().trim().optional(),
  issued_date: date,
  issue_condition: z.string().trim().optional(),
  reason: z.string().trim().min(3, "A reason is required."),
});

export const assetReturnSchema = z.object({
  returned_date: date,
  return_condition: z.string().trim().optional(),
  reason: z.string().trim().min(3, "A reason is required."),
});

export const assetDeductionSchema = z.object({
  amount: money,
  deduction_month: optionalMonth,
  reason: z.string().trim().min(3, "A reason is required."),
});
