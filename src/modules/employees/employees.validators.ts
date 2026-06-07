import { z } from "zod";

import {
  COMPENSATION_CALCULATION_TYPES,
  COMPENSATION_COMPONENT_TYPES,
  EMPLOYEE_SORT_FIELDS,
  EMPLOYEE_TYPES,
  EMPLOYMENT_STATUSES,
} from "./employees.constants";
import type {
  CompensationComponentDefinitionFilters,
  CompensationComponentDefinitionInput,
  DocumentMetadataInput,
  EmployeeCompensationComponentChangeInput,
  EmployeeCompensationComponentEndInput,
  EmployeeCompensationComponentInput,
  EmployeeCreateInput,
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

const asRecord = (payload: unknown): Record<string, unknown> =>
  typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : {};

const salaryTypes = ["monthly"] as const;
const salaryChangeTypes = ["starting_salary", "increment", "promotion", "correction", "contract_change", "other"] as const;
const jobChangeTypes = [
  "promotion",
  "transfer",
  "department_change",
  "position_change",
  "outlet_change",
  "correction",
  "other",
] as const;

const isValidDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

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

export const validateEmployeeCreateInput = (payload: unknown): EmployeeCreateInput => {
  const rawPayload = asRecord(payload);
  const input = blankToNull(parse(employeeBase, payload));
  ensureEmployeeIdentityDetails(input);

  const rawSalary = asRecord(rawPayload.starting_salary);
  if (!rawPayload.starting_salary || Object.keys(rawSalary).length === 0) {
    throw new AppError({
      code: "STARTING_SALARY_REQUIRED",
      title: "Starting salary required",
      message: "Starting salary is required.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        "starting_salary.amount": "Starting salary is required.",
      },
    });
  }

  const salaryType = String(rawSalary.salary_type ?? "monthly").trim();
  if (!salaryTypes.includes(salaryType as (typeof salaryTypes)[number])) {
    throw new AppError({
      code: "INVALID_SALARY_TYPE",
      title: "Invalid salary type",
      message: "Select a valid salary type.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        "starting_salary.salary_type": "Select a valid salary type.",
      },
    });
  }

  const amountValue = rawSalary.monthly_salary_amount ?? rawSalary.amount;
  const amount = typeof amountValue === "number"
    ? amountValue
    : typeof amountValue === "string" && amountValue.trim() !== ""
      ? Number(amountValue)
      : NaN;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError({
      code: "INVALID_SALARY_AMOUNT",
      title: "Invalid salary amount",
      message: "Starting salary must be a positive amount in integer minor units.",
      statusCode: 400,
      retryable: false,
      fieldErrors: {
        "starting_salary.amount": "Starting salary must be a positive amount in integer minor units.",
      },
    });
  }

  const effectiveFrom =
    typeof rawSalary.effective_from === "string" && rawSalary.effective_from.trim()
      ? rawSalary.effective_from.trim()
      : input.joined_at ?? new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    throw new ValidationError("Please enter a valid salary effective date.", {
      "starting_salary.effective_from": "Please enter a valid salary effective date.",
    });
  }

  return {
    ...input,
    starting_salary: {
      monthly_salary_amount: amount,
      salary_type: "monthly",
      currency:
        typeof rawSalary.currency === "string" && rawSalary.currency.trim()
          ? rawSalary.currency.trim().toUpperCase()
          : "MVR",
      effective_from: effectiveFrom,
      reason:
        typeof rawSalary.reason === "string" && rawSalary.reason.trim()
          ? rawSalary.reason.trim()
          : "Starting salary",
    },
  } satisfies EmployeeCreateInput;
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

export const validateEmployeeStatusInput = (payload: unknown): EmployeeStatusInput => {
  const raw = asRecord(payload);
  const parsed = parse(
    z.object({
        new_status: z.enum(EMPLOYMENT_STATUSES),
        reason,
        effective_from: z
          .string({
            required_error: "Effective date is required.",
          })
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid effective date."),
        effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notes: optionalTrimmed,
        disable_user_access: z.boolean().optional(),
        revoke_active_sessions: z.boolean().optional(),
        override_invalid_transition: z.boolean().optional(),
        override_reason: optionalTrimmed,
        target_active_status: z.enum(["active", "probation", "confirmed"]).optional(),
    }),
    {
      ...raw,
      effective_from:
        typeof raw.effective_from === "string"
          ? raw.effective_from
          : typeof raw.effective_date === "string"
            ? raw.effective_date
            : undefined,
    },
  );
  if (!isValidDateOnly(parsed.effective_from)) {
    throw new ValidationError("Please enter a valid effective date.", {
      effective_from: "Please enter a valid effective date.",
    });
  }
  return blankToNull(parsed);
};

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

const readPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const readNonNegativeInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const readBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
};

export const validateJobChangeInput = (payload: unknown): JobChangeInput => {
  const raw = asRecord(payload);
  const fieldErrors: Record<string, string> = {};
  const changeType = typeof raw.change_type === "string" ? raw.change_type.trim() : "";
  const effectiveFrom = typeof raw.effective_from === "string" ? raw.effective_from.trim() : "";
  const rawReason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  const newDepartmentId =
    typeof raw.new_department_id === "string"
      ? raw.new_department_id.trim()
      : typeof raw.department_id === "string"
        ? raw.department_id.trim()
        : undefined;
  const newPositionId =
    typeof raw.new_position_id === "string"
      ? raw.new_position_id.trim()
      : typeof raw.position_id === "string"
        ? raw.position_id.trim()
        : undefined;
  const newOutletId =
    typeof raw.new_outlet_id === "string"
      ? raw.new_outlet_id.trim()
      : typeof raw.outlet_id === "string"
        ? raw.outlet_id.trim()
        : undefined;

  if (!changeType || !jobChangeTypes.includes(changeType as (typeof jobChangeTypes)[number])) {
    fieldErrors.change_type = "Select a valid job change type.";
  }

  if (!effectiveFrom || !isValidDateOnly(effectiveFrom)) {
    fieldErrors.effective_from = effectiveFrom ? "Please enter a valid effective date." : "Effective date is required.";
  }

  if (rawReason.length < 3) {
    fieldErrors.reason = "Reason is required.";
  }

  const rawSalaryChange = asRecord(raw.salary_change);
  const salaryEnabled = rawSalaryChange.enabled === true;
  let salaryChange: JobChangeInput["salary_change"] = null;

  if (salaryEnabled) {
    const amount = readPositiveInteger(rawSalaryChange.monthly_salary_amount);
    const currency =
      typeof rawSalaryChange.currency === "string" && rawSalaryChange.currency.trim()
        ? rawSalaryChange.currency.trim().toUpperCase()
        : "MVR";
    const salaryType =
      typeof rawSalaryChange.change_type === "string" && rawSalaryChange.change_type.trim()
        ? rawSalaryChange.change_type.trim()
        : "contract_change";
    const salaryReason =
      typeof rawSalaryChange.reason === "string" && rawSalaryChange.reason.trim()
        ? rawSalaryChange.reason.trim()
        : rawReason;

    if (amount === null) {
      fieldErrors["salary_change.monthly_salary_amount"] = "Salary amount must be greater than zero.";
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      fieldErrors["salary_change.currency"] = "Please enter a valid currency code.";
    }

    if (!salaryChangeTypes.includes(salaryType as (typeof salaryChangeTypes)[number])) {
      fieldErrors["salary_change.change_type"] = "Select a valid salary change type.";
    }

    if (salaryReason.length < 3) {
      fieldErrors["salary_change.reason"] = "Salary change reason is required.";
    }

    salaryChange = {
      enabled: true,
      monthly_salary_amount: amount ?? undefined,
      currency,
      change_type: salaryType as SalaryHistoryInput["change_type"],
      reason: salaryReason,
    };
  }

  if (Object.keys(fieldErrors).length > 0) {
    const first = Object.keys(fieldErrors)[0];
    const code =
      first === "change_type"
        ? "INVALID_JOB_CHANGE_TYPE"
        : first === "effective_from"
          ? "JOB_CHANGE_EFFECTIVE_DATE_REQUIRED"
          : first === "reason"
            ? "JOB_CHANGE_REASON_REQUIRED"
            : first === "salary_change.monthly_salary_amount"
              ? "INVALID_SALARY_AMOUNT"
              : "VALIDATION_ERROR";
    throw new AppError({
      code,
      title: "Job change could not be saved",
      message: fieldErrors[first] ?? "Please review the job change form.",
      statusCode: 400,
      retryable: false,
      fieldErrors,
    });
  }

  return {
    change_type: changeType as JobChangeInput["change_type"],
    new_department_id: newDepartmentId === undefined ? undefined : newDepartmentId || null,
    new_position_id: newPositionId === undefined ? undefined : newPositionId || null,
    new_outlet_id: newOutletId === undefined ? undefined : newOutletId || null,
    effective_from: effectiveFrom,
    reason: rawReason,
    salary_change: salaryChange,
  };
};

export const validateSalaryHistoryInput = (payload: unknown): SalaryHistoryInput =>
  {
    const raw = asRecord(payload);
    const fieldErrors: Record<string, string> = {};
    const amountValue = raw.monthly_salary_amount;
    const amount = typeof amountValue === "number"
      ? amountValue
      : typeof amountValue === "string" && amountValue.trim() !== ""
        ? Number(amountValue)
        : NaN;

    if (!Number.isInteger(amount) || amount <= 0) {
      fieldErrors.monthly_salary_amount = "Salary amount must be greater than zero.";
    }

    const effectiveFrom = typeof raw.effective_from === "string" ? raw.effective_from.trim() : "";
    if (!effectiveFrom || !isValidDateOnly(effectiveFrom)) {
      fieldErrors.effective_from = effectiveFrom ? "Please enter a valid effective date." : "Effective date is required.";
    }

    const changeType = typeof raw.change_type === "string" ? raw.change_type.trim() : "";
    if (!salaryChangeTypes.includes(changeType as (typeof salaryChangeTypes)[number])) {
      fieldErrors.change_type = "Select a valid salary change type.";
    }

    const rawReason = typeof raw.reason === "string" ? raw.reason.trim() : "";
    if (rawReason.length < 3) {
      fieldErrors.reason = "Reason is required.";
    }

    const currency =
      typeof raw.currency === "string" && raw.currency.trim()
        ? raw.currency.trim().toUpperCase()
        : "MVR";
    if (!/^[A-Z]{3}$/.test(currency)) {
      fieldErrors.currency = "Please enter a valid currency code.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      const first = Object.keys(fieldErrors)[0];
      const code =
        first === "monthly_salary_amount"
          ? "INVALID_SALARY_AMOUNT"
          : first === "effective_from"
            ? "INVALID_SALARY_EFFECTIVE_DATE"
            : first === "change_type"
              ? "INVALID_SALARY_CHANGE_TYPE"
              : first === "reason"
                ? "SALARY_CHANGE_REASON_REQUIRED"
                : "VALIDATION_ERROR";
      throw new AppError({
        code,
        title: "Salary change could not be saved",
        message: fieldErrors[first] ?? "Please review the salary change form.",
        statusCode: 400,
        retryable: false,
        fieldErrors,
      });
    }

    return {
      monthly_salary_amount: amount,
      currency,
      effective_from: effectiveFrom,
      change_type: changeType as SalaryHistoryInput["change_type"],
      reason: rawReason,
    };
  };

const readCompensationPayload = (payload: unknown) => {
  const raw = asRecord(payload);
  const fieldErrors: Record<string, string> = {};

  const componentType = typeof raw.component_type === "string" ? raw.component_type.trim() : "";
  if (!COMPENSATION_COMPONENT_TYPES.includes(componentType as EmployeeCompensationComponentInput["component_type"])) {
    fieldErrors.component_type = "Select a valid compensation component type.";
  }

  const calculationType = typeof raw.calculation_type === "string" && raw.calculation_type.trim()
    ? raw.calculation_type.trim()
    : "fixed_amount";
  if (!COMPENSATION_CALCULATION_TYPES.includes(calculationType as EmployeeCompensationComponentInput["calculation_type"])) {
    fieldErrors.calculation_type = "Select a valid compensation calculation type.";
  }

  const componentName = typeof raw.component_name === "string" ? raw.component_name.trim() : "";
  if (!componentName) {
    fieldErrors.component_name = "Component name is required.";
  }

  const effectiveFrom = typeof raw.effective_from === "string" ? raw.effective_from.trim() : "";
  if (!effectiveFrom || !isValidDateOnly(effectiveFrom)) {
    fieldErrors.effective_from = effectiveFrom ? "Please enter a valid effective date." : "Effective date is required.";
  }

  const rawReason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (rawReason.length < 3) {
    fieldErrors.reason = "Reason is required.";
  }

  const amount = readNonNegativeInteger(raw.amount);
  if (amount === null) {
    fieldErrors.amount = calculationType === "percentage_of_basic_salary"
      ? "Percentage must be a valid whole number."
      : "Amount must be a valid whole number.";
  } else if (calculationType === "percentage_of_basic_salary" && (amount <= 0 || amount > 1000)) {
    fieldErrors.amount = "Percentage must be greater than 0 and no more than 1000.";
  } else if (calculationType !== "percentage_of_basic_salary" && amount <= 0) {
    fieldErrors.amount = "Amount must be greater than zero.";
  }

  const currency =
    typeof raw.currency === "string" && raw.currency.trim()
      ? raw.currency.trim().toUpperCase()
      : "MVR";
  if (!/^[A-Z]{3}$/.test(currency)) {
    fieldErrors.currency = "Please enter a valid currency code.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    const first = Object.keys(fieldErrors)[0];
    const code =
      first === "amount" && calculationType === "percentage_of_basic_salary"
        ? "INVALID_COMPENSATION_PERCENTAGE"
        : first === "amount"
          ? "INVALID_COMPENSATION_AMOUNT"
          : first === "effective_from"
            ? "COMPENSATION_EFFECTIVE_DATE_REQUIRED"
            : first === "reason"
              ? "COMPENSATION_REASON_REQUIRED"
              : "INVALID_COMPENSATION_COMPONENT";
    throw new AppError({
      code,
      title: "Compensation component could not be saved",
      message: fieldErrors[first] ?? "Please review the compensation component form.",
      statusCode: 400,
      retryable: false,
      fieldErrors,
    });
  }

  const defaultGross = componentType === "allowance";
  const defaultNet = componentType !== "benefit" || calculationType !== "non_cash_benefit";

  return {
    component_definition_id:
      typeof raw.component_definition_id === "string" && raw.component_definition_id.trim()
        ? raw.component_definition_id.trim()
        : null,
    component_type: componentType as EmployeeCompensationComponentInput["component_type"],
    component_code:
      typeof raw.component_code === "string" && raw.component_code.trim()
        ? raw.component_code.trim().toUpperCase()
        : null,
    component_name: componentName,
    category:
      typeof raw.category === "string" && raw.category.trim()
        ? raw.category.trim()
        : null,
    amount: amount ?? 0,
    currency,
    calculation_type: calculationType as EmployeeCompensationComponentInput["calculation_type"],
    affects_gross_pay: readBoolean(raw.affects_gross_pay, defaultGross),
    affects_net_pay: readBoolean(raw.affects_net_pay, defaultNet),
    effective_from: effectiveFrom,
    reason: rawReason,
    notes:
      typeof raw.notes === "string" && raw.notes.trim()
        ? raw.notes.trim()
        : null,
  } satisfies EmployeeCompensationComponentInput;
};

export const validateCompensationDefinitionFilters = (
  query: Record<string, string | undefined>,
): CompensationComponentDefinitionFilters => {
  const parsed = parse(
    z.object({
      search: z.string().trim().optional(),
      component_type: z.enum(COMPENSATION_COMPONENT_TYPES).optional(),
      status: z.enum(["active", "inactive"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
    }),
    query,
  );

  return parsed;
};

export const validateCompensationDefinitionInput = (
  payload: unknown,
): CompensationComponentDefinitionInput => {
  const raw = asRecord(payload);
  const fieldErrors: Record<string, string> = {};

  const componentType = typeof raw.component_type === "string" ? raw.component_type.trim() : "";
  if (!COMPENSATION_COMPONENT_TYPES.includes(componentType as CompensationComponentDefinitionInput["component_type"])) {
    fieldErrors.component_type = "Select a valid compensation component type.";
  }

  const componentCode =
    typeof raw.component_code === "string" && raw.component_code.trim()
      ? raw.component_code.trim().toUpperCase()
      : "";

  if (!componentCode) {
    fieldErrors.component_code = "Component code is required.";
  }

  const calculationType = typeof raw.calculation_type === "string" && raw.calculation_type.trim()
    ? raw.calculation_type.trim()
    : "fixed_amount";
  if (!COMPENSATION_CALCULATION_TYPES.includes(calculationType as CompensationComponentDefinitionInput["calculation_type"])) {
    fieldErrors.calculation_type = "Select a valid compensation calculation type.";
  }

  const componentName = typeof raw.component_name === "string" ? raw.component_name.trim() : "";
  if (!componentName) {
    fieldErrors.component_name = "Component name is required.";
  }

  const amount = readNonNegativeInteger(raw.default_amount ?? raw.amount);
  if (amount === null) {
    fieldErrors.default_amount = calculationType === "percentage_of_basic_salary"
      ? "Default percentage must be a valid whole number."
      : "Default amount must be a valid whole number.";
  } else if (calculationType === "percentage_of_basic_salary" && amount > 1000) {
    fieldErrors.default_amount = "Default percentage must be no more than 1000.";
  }

  const currency =
    typeof raw.currency === "string" && raw.currency.trim()
      ? raw.currency.trim().toUpperCase()
      : "MVR";
  if (!/^[A-Z]{3}$/.test(currency)) {
    fieldErrors.currency = "Please enter a valid currency code.";
  }

  const rawReason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (rawReason.length < 3) {
    fieldErrors.reason = "Reason is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    const first = Object.keys(fieldErrors)[0];
    const code =
      first === "default_amount" && calculationType === "percentage_of_basic_salary"
        ? "INVALID_COMPENSATION_PERCENTAGE"
        : first === "default_amount"
          ? "INVALID_COMPENSATION_AMOUNT"
          : first === "reason"
            ? "COMPENSATION_REASON_REQUIRED"
            : "INVALID_COMPENSATION_COMPONENT";
    throw new AppError({
      code,
      title: "Compensation component could not be saved",
      message: fieldErrors[first] ?? "Please review the compensation component form.",
      statusCode: 400,
      retryable: false,
      fieldErrors,
    });
  }

  const defaultGross = componentType === "allowance";
  const defaultNet = componentType !== "benefit" || calculationType !== "non_cash_benefit";

  return {
    component_type: componentType as CompensationComponentDefinitionInput["component_type"],
    component_code: componentCode,
    component_name: componentName,
    category:
      typeof raw.category === "string" && raw.category.trim()
        ? raw.category.trim()
        : null,
    default_amount: amount ?? 0,
    currency,
    calculation_type: calculationType as CompensationComponentDefinitionInput["calculation_type"],
    affects_gross_pay: readBoolean(raw.affects_gross_pay, defaultGross),
    affects_net_pay: readBoolean(raw.affects_net_pay, defaultNet),
    description:
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : null,
    reason: rawReason,
  };
};

export const validateCompensationComponentInput = (
  payload: unknown,
): EmployeeCompensationComponentInput => readCompensationPayload(payload);

export const validateCompensationComponentChangeInput = (
  payload: unknown,
): EmployeeCompensationComponentChangeInput => {
  const parsed = readCompensationPayload(payload);
  const { component_definition_id: _definitionId, ...change } = parsed;
  return change;
};

export const validateCompensationComponentEndInput = (
  payload: unknown,
): EmployeeCompensationComponentEndInput => {
  const raw = asRecord(payload);
  const effectiveTo = typeof raw.effective_to === "string" ? raw.effective_to.trim() : "";
  const rawReason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  const fieldErrors: Record<string, string> = {};

  if (!effectiveTo || !isValidDateOnly(effectiveTo)) {
    fieldErrors.effective_to = effectiveTo ? "Please enter a valid end date." : "End date is required.";
  }

  if (rawReason.length < 3) {
    fieldErrors.reason = "Reason is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    const first = Object.keys(fieldErrors)[0];
    throw new AppError({
      code: first === "reason" ? "COMPENSATION_REASON_REQUIRED" : "COMPENSATION_EFFECTIVE_DATE_REQUIRED",
      title: "Compensation component could not be ended",
      message: fieldErrors[first] ?? "Please review the compensation component form.",
      statusCode: 400,
      retryable: false,
      fieldErrors,
    });
  }

  return {
    effective_to: effectiveTo,
    reason: rawReason,
  };
};

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
