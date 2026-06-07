import { z } from "zod";

import { ValidationError } from "../../utils/errors";
import { CONTRACT_STATUSES, CONTRACT_TYPES } from "./employee-contracts.constants";
import type {
  ContractActionInput,
  ContractCreateInput,
  ContractListFilters,
  ContractRenewInput,
  ContractUpdateInput,
} from "./employee-contracts.types";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.");
const optionalText = z.string().trim().max(2000).optional().nullable();
const safeString = z.string().trim().min(1).max(160);
const reason = z.string().trim().min(3, "A reason is required.").max(1000);

const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fieldErrors[issue.path.join(".") || "form"] = issue.message;
  }
  throw new ValidationError("Please review the contract form and try again.", fieldErrors);
};

const dateRangeRefinement = <T extends { start_date?: string; end_date?: string | null }>(value: T, ctx: z.RefinementCtx) => {
  if (value.start_date && value.end_date && value.end_date <= value.start_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "Contract end date must be after start date." });
  }
};

export const validateContractCreateInput = (input: unknown): ContractCreateInput =>
  parse(
    z.object({
      contract_number: safeString.optional().nullable(),
      contract_type: z.enum(CONTRACT_TYPES, { errorMap: () => ({ message: "Invalid contract type." }) }),
      contract_status: z.enum(CONTRACT_STATUSES).optional(),
      start_date: dateString,
      end_date: dateString.optional().nullable(),
      signed_date: dateString.optional().nullable(),
      probation_end_date: dateString.optional().nullable(),
      document_id: safeString.optional().nullable(),
      salary_snapshot_amount: z.coerce.number().int().nonnegative().optional().nullable(),
      currency: z.string().trim().min(3).max(8).optional().nullable(),
      position_id: safeString.optional().nullable(),
      department_id: safeString.optional().nullable(),
      outlet_id: safeString.optional().nullable(),
      notes: optionalText,
      reason,
    }).superRefine(dateRangeRefinement),
    input,
  );

export const validateContractUpdateInput = (input: unknown): ContractUpdateInput =>
  parse(
    z.object({
      contract_number: safeString.optional().nullable(),
      contract_type: z.enum(CONTRACT_TYPES).optional(),
      contract_status: z.enum(CONTRACT_STATUSES).optional(),
      start_date: dateString.optional(),
      end_date: dateString.optional().nullable(),
      signed_date: dateString.optional().nullable(),
      probation_end_date: dateString.optional().nullable(),
      document_id: safeString.optional().nullable(),
      salary_snapshot_amount: z.coerce.number().int().nonnegative().optional().nullable(),
      currency: z.string().trim().min(3).max(8).optional().nullable(),
      position_id: safeString.optional().nullable(),
      department_id: safeString.optional().nullable(),
      outlet_id: safeString.optional().nullable(),
      notes: optionalText,
      reason,
    }).superRefine(dateRangeRefinement),
    input,
  );

export const validateContractRenewInput = (input: unknown): ContractRenewInput =>
  parse(
    z.object({
      new_contract_number: safeString.optional().nullable(),
      start_date: dateString,
      end_date: dateString.optional().nullable(),
      signed_date: dateString.optional().nullable(),
      probation_end_date: dateString.optional().nullable(),
      document_id: safeString.optional().nullable(),
      notes: optionalText,
      reason,
    }).superRefine(dateRangeRefinement),
    input,
  );

export const validateContractActionInput = (input: unknown): ContractActionInput =>
  parse(z.object({ reason, notes: optionalText }), input);

export const validateContractListFilters = (query: Record<string, unknown>): ContractListFilters => {
  const value = parse(
    z.object({
      employee_id: safeString.optional(),
      outlet_id: safeString.optional(),
      department_id: safeString.optional(),
      position_id: safeString.optional(),
      contract_type: z.enum(CONTRACT_TYPES).optional(),
      contract_status: z.enum(CONTRACT_STATUSES).optional(),
      expiring_within_days: z.coerce.number().int().positive().max(730).optional(),
      expired: z.coerce.boolean().optional(),
      date_from: dateString.optional(),
      date_to: dateString.optional(),
      search: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().positive().default(1),
      page_size: z.coerce.number().int().positive().max(100).default(25),
    }),
    query,
  );
  return { ...value, page: value.page ?? 1, page_size: value.page_size ?? 25 };
};
