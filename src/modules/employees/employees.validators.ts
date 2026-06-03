import { z } from "zod";

import {
  EMPLOYEE_SORT_FIELDS,
  EMPLOYEE_TYPES,
  EMPLOYMENT_STATUSES,
} from "./employees.constants";
import type {
  DocumentMetadataInput,
  EmployeeListFilters,
  EmployeeNoteInput,
  EmployeeStatusInput,
  EmployeeUpdateInput,
  EmployeeWriteInput,
  JobChangeInput,
  OutletAssignmentInput,
  SalaryHistoryInput,
  SortDirection,
} from "./employees.types";
import { AppError, ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message);
  }

  return result.data;
};

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid date.")
  .nullable()
  .optional();

const optionalTrimmed = z.string().trim().nullable().optional();

const reason = z.string().trim().min(3, "A reason is required for this action.");

const employeeBase = z.object({
  employee_code: z.string().trim().nullable().optional(),
  full_name: z.string().trim().min(1, "Employee name is required."),
  employee_type: z.enum(EMPLOYEE_TYPES),
  primary_outlet_id: z.string().trim().min(1, "Primary outlet is required."),
  department_id: z.string().trim().min(1).nullable().optional(),
  position_id: z.string().trim().min(1).nullable().optional(),
  employment_status: z.enum(EMPLOYMENT_STATUSES),
  joined_at: optionalDate,
  nationality: optionalTrimmed,
  id_card_number: optionalTrimmed,
  passport_number: optionalTrimmed,
  passport_expiry_date: optionalDate,
  work_permit_number: optionalTrimmed,
  work_permit_expiry_date: optionalDate,
  phone: optionalTrimmed,
  emergency_contact_name: optionalTrimmed,
  emergency_contact_phone: optionalTrimmed,
  contract_type: optionalTrimmed,
  bank_name: optionalTrimmed,
  bank_account_masked: optionalTrimmed,
  notes: optionalTrimmed,
});

const blankToNull = <T extends Record<string, unknown>>(input: T): T => {
  const normalized = { ...input };

  for (const [key, value] of Object.entries(normalized)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      normalized[key as keyof T] = (trimmed === "" ? null : trimmed) as T[keyof T];
    }
  }

  return normalized;
};

const ensureEmployeeIdentityDetails = (input: EmployeeWriteInput | EmployeeUpdateInput) => {
  if (input.employee_type === "local" && !input.id_card_number) {
    throw new ValidationError("National ID number is required for local employees.", {
      id_card_number: "National ID number is required for local employees.",
    });
  }

  if (input.employee_type === "foreign") {
    const fieldErrors: Record<string, string> = {};

    if (!input.nationality) {
      fieldErrors.nationality = "Nationality is required for foreign employees.";
    }
    if (!input.passport_number) {
      fieldErrors.passport_number = "Passport number is required for foreign employees.";
    }
    if (!input.passport_expiry_date) {
      fieldErrors.passport_expiry_date = "Passport expiry date is required for foreign employees.";
    }
    if (!input.work_permit_number) {
      fieldErrors.work_permit_number = "Work permit number is required for foreign employees.";
    }
    if (!input.work_permit_expiry_date) {
      fieldErrors.work_permit_expiry_date = "Work permit expiry date is required for foreign employees.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError("Please complete the required foreign employee identity fields.", fieldErrors);
    }
  }
};

export const validateEmployeeListFilters = (
  query: Record<string, string | undefined>,
): EmployeeListFilters => {
  const parsed = parse(
    z.object({
      search: z.string().trim().optional(),
      outlet_id: z.string().trim().optional(),
      department_id: z.string().trim().optional(),
      position_id: z.string().trim().optional(),
      employment_status: z.enum(EMPLOYMENT_STATUSES).optional(),
      employee_type: z.enum(EMPLOYEE_TYPES).optional(),
      nationality: z.string().trim().optional(),
      joined_from: z.string().trim().optional(),
      joined_to: z.string().trim().optional(),
      document_expiring_before: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
      sort_by: z.enum(EMPLOYEE_SORT_FIELDS).default("created_at"),
      sort_direction: z
        .enum(["asc", "desc"])
        .default("desc") as z.ZodType<SortDirection>,
    }),
    query,
  );

  return parsed;
};

export const validateEmployeeCreateInput = (payload: unknown): EmployeeWriteInput => {
  const input = blankToNull(parse(employeeBase, payload));
  ensureEmployeeIdentityDetails(input);
  return input;
};

export const validateEmployeeUpdateInput = (payload: unknown): EmployeeUpdateInput => {
  const rawPayload =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};

  for (const field of ["employment_status", "resigned_at", "terminated_at", "deleted_at"]) {
    if (field in rawPayload) {
      throw new AppError(
        "Employee status changes must be made through the status action.",
        "EMPLOYEE_STATUS_CHANGE_REQUIRES_STATUS_ENDPOINT",
        400,
      );
    }
  }

  if ("primary_outlet_id" in rawPayload) {
    throw new AppError(
      "Employee outlet changes must be made through the outlet assignment action.",
      "EMPLOYEE_OUTLET_CHANGE_REQUIRES_ASSIGNMENT_ENDPOINT",
      400,
    );
  }

  if ("employee_code" in rawPayload) {
    throw new AppError(
      "Employee ID is system-generated and cannot be changed here.",
      "EMPLOYEE_CODE_SYSTEM_GENERATED",
      400,
    );
  }

  const input = blankToNull(parse(
    employeeBase.omit({
      employee_code: true,
      primary_outlet_id: true,
      employment_status: true,
    }).partial(),
    payload,
  ));
  return input;
};

export const validateEmployeeStatusInput = (payload: unknown): EmployeeStatusInput =>
  parse(
    z.object({
      new_status: z.enum(EMPLOYMENT_STATUSES),
      reason,
      effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    payload,
  );

export const validateOutletAssignmentInput = (
  payload: unknown,
): OutletAssignmentInput =>
  parse(
    z.object({
      outlet_id: z.string().trim().min(1, "Outlet is required."),
      effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid effective date."),
      reason,
    }),
    payload,
  );

export const validateJobChangeInput = (payload: unknown): JobChangeInput =>
  parse(
    z.object({
      department_id: z.string().trim().min(1).nullable().optional(),
      position_id: z.string().trim().min(1).nullable().optional(),
      effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid effective date."),
      reason,
    }),
    payload,
  );

export const validateSalaryHistoryInput = (payload: unknown): SalaryHistoryInput =>
  parse(
    z.object({
      monthly_salary_amount: z
        .number()
        .int("Salary amount must be stored as integer minor units."),
      currency: z.string().trim().default("MVR"),
      effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid effective date."),
      reason,
    }),
    payload,
  );

export const validateDocumentMetadataInput = (
  payload: unknown,
): DocumentMetadataInput =>
  parse(
    z.object({
      document_type: z.string().trim().min(1, "Document type is required."),
      file_key: z.string().trim().min(1, "Document file reference is required."),
      file_name: z.string().trim().nullable().optional(),
      mime_type: z.string().trim().nullable().optional(),
      expiry_date: optionalDate,
      is_sensitive: z.boolean().default(true),
    }),
    payload,
  );

export const validateEmployeeNoteInput = (payload: unknown): EmployeeNoteInput =>
  parse(
    z.object({
      note_type: z.string().trim().default("general"),
      note: z.string().trim().min(1, "Note is required."),
      is_sensitive: z.boolean().default(false),
    }),
    payload,
  );
