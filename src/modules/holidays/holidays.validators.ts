import { z } from "zod";

import type { HolidayCheckInput, HolidayFilters, HolidayInput, HolidaySettingsInput } from "./holidays.types";
import { ValidationError } from "../../utils/errors";

const date = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const id = z.string().trim().min(1).max(128).optional();
const bool = z.preprocess((value) => {
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return value;
}, z.boolean());

const optionalBool = bool.optional();

const holidayBaseSchema = z.object({
  name: z.string().trim().min(2, "Holiday name is required.").max(160),
  code: z.string().trim().max(64).optional().nullable(),
  holiday_type: z.enum([
    "public_holiday",
    "company_holiday",
    "outlet_holiday",
    "optional_holiday",
    "religious_holiday",
    "national_holiday",
    "replacement_holiday",
    "other",
    "public",
    "company",
  ]).default("company_holiday"),
  date,
  end_date: date.optional().nullable(),
  is_recurring: optionalBool,
  recurrence_rule: z.string().trim().max(80).optional().nullable(),
  recurrence_month: z.coerce.number().int().min(1).max(12).optional().nullable(),
  recurrence_day: z.coerce.number().int().min(1).max(31).optional().nullable(),
  outlet_id: z.string().trim().max(128).optional().nullable(),
  department_id: z.string().trim().max(128).optional().nullable(),
  applies_to_all_outlets: optionalBool,
  applies_to_local_employees: optionalBool,
  applies_to_foreign_employees: optionalBool,
  paid_holiday: optionalBool,
  counts_as_working_day: optionalBool,
  affects_leave_duration: optionalBool,
  affects_attendance_absence: optionalBool,
  affects_overtime: optionalBool,
  affects_long_leave_payroll: optionalBool,
  requires_work_pay_rate_multiplier: z.coerce.number().min(0).max(10).optional().nullable(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  reason: z.string().trim().min(2, "Please provide a reason.").max(500).optional(),
});

const refineHolidayDates = <T extends { date?: string; end_date?: string | null; is_recurring?: boolean }>(value: T, ctx: z.RefinementCtx) => {
  if (!value.date) return;
  if (value.end_date && value.end_date < value.date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "End date must be on or after the holiday date." });
  }
  if (value.is_recurring && value.end_date && value.end_date.slice(5) < value.date.slice(5)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "Recurring multi-day holidays must stay within the same calendar year." });
  }
};

const holidayInputSchema = holidayBaseSchema.superRefine(refineHolidayDates);
const holidayUpdateSchema = holidayBaseSchema.partial({ name: true, holiday_type: true, date: true }).superRefine(refineHolidayDates);

const settingsSchema = z.object({
  holiday_module_enabled: optionalBool,
  public_holidays_enabled: optionalBool,
  company_holidays_enabled: optionalBool,
  outlet_specific_holidays_enabled: optionalBool,
  optional_holidays_enabled: optionalBool,
  other_holidays_enabled: optionalBool,
  holiday_leave_rules_enabled: optionalBool,
  holiday_attendance_rules_enabled: optionalBool,
  holiday_roster_rules_enabled: optionalBool,
  holidays_exclude_from_paid_leave: optionalBool,
  holidays_exclude_from_unpaid_leave: optionalBool,
  exclude_holidays_from_leave: optionalBool,
  pay_holidays_during_long_leave: optionalBool,
  holidays_count_as_attendance_excused: optionalBool,
  holiday_work_overtime_enabled: optionalBool,
  replacement_holidays_enabled: optionalBool,
  holiday_import_enabled: optionalBool,
  holiday_approval_required: optionalBool,
  require_reason_for_holiday_changes: optionalBool,
  default_holiday_pay_multiplier: z.coerce.number().min(0).max(10).optional(),
  reason: z.string().trim().min(2, "Please provide a reason.").max(500),
});

export const validateHolidayInput = (input: unknown): HolidayInput => {
  const result = holidayInputSchema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review the holiday details.");
  return result.data;
};

export const validateHolidayUpdate = (input: unknown): Partial<HolidayInput> & { reason?: string } => {
  const result = holidayUpdateSchema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review the holiday details.");
  return result.data;
};

export const validateHolidaySettings = (input: unknown): HolidaySettingsInput => {
  const result = settingsSchema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review holiday settings.");
  return result.data;
};

export const validateHolidayFilters = (input: Record<string, unknown>): HolidayFilters => {
  const result = z.object({
    date: date.optional(),
    from_date: date.optional(),
    to_date: date.optional(),
    year: z.coerce.number().int().min(1900).max(2200).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    outlet_id: id,
    department_id: id,
    holiday_type: z.string().trim().max(80).optional(),
    status: z.string().trim().max(40).optional(),
    recurring: bool.optional(),
    employee_type: z.enum(["local", "foreign"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(25),
  }).safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review holiday filters.");
  const filters = result.data;
  if (filters.to_date && filters.from_date && filters.to_date < filters.from_date) {
    throw new ValidationError("The end date must be on or after the start date.");
  }
  return filters;
};

export const validateCheckDate = (input: unknown): HolidayCheckInput => {
  const result = z.object({
    date,
    employee_id: z.string().trim().max(128).optional(),
    outlet_id: z.string().trim().max(128).optional().nullable(),
  }).safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review date check details.");
  return result.data;
};

export const validateReason = (input: unknown) => {
  const result = z.object({ reason: z.string().trim().min(2, "Please provide a reason.").max(500) }).safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "A reason is required.");
  return result.data;
};
