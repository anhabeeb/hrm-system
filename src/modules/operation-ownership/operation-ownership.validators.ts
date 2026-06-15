import { z } from "zod";

import {
  OPERATION_RESPONSIBILITY_FALLBACKS,
  OPERATION_RESPONSIBILITY_TYPES,
  OPERATION_TARGET_TYPES,
} from "./operation-ownership.types";
import type {
  BusinessFunctionInput,
  FunctionDepartmentAssignmentInput,
  OperationCatalogInput,
  OperationResolutionInput,
  OperationResponsibilityInput,
  OwnershipFilters,
} from "./operation-ownership.types";

const optionalString = z.string().trim().min(1).optional().nullable();
const boolish = z.union([z.boolean(), z.literal(0), z.literal(1)]).optional();
const bool = (value: unknown) => value === 1 ? true : value === 0 ? false : value;

const filtersSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  operation_code: z.string().trim().optional(),
  module_key: z.string().trim().optional(),
  business_function_id: z.string().trim().optional(),
  responsibility_type: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

const businessFunctionSchema = z.object({
  code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  is_sensitive: boolish.transform(bool),
  is_active: boolish.transform(bool),
});

const assignmentSchema = z.object({
  business_function_id: z.string().trim().min(1),
  department_id: z.string().trim().min(1),
  assignment_type: z.string().trim().min(1).max(80).default("PRIMARY"),
  is_primary: boolish.transform(bool),
  is_active: boolish.transform(bool),
  effective_from: optionalString,
  effective_to: optionalString,
});

const operationSchema = z.object({
  operation_code: z.string().trim().min(2).max(100).transform((value) => value.toUpperCase()),
  operation_name: z.string().trim().min(2).max(180),
  module_key: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).optional().nullable(),
  default_business_function_code: z.string().trim().max(100).optional().nullable(),
  is_sensitive: boolish.transform(bool),
  requires_final_approval: boolish.transform(bool),
  is_active: boolish.transform(bool),
});

const responsibilityBaseSchema = z.object({
  operation_code: z.string().trim().min(2).max(100).transform((value) => value.toUpperCase()),
  responsibility_type: z.enum(OPERATION_RESPONSIBILITY_TYPES),
  target_type: z.enum(OPERATION_TARGET_TYPES),
  business_function_id: optionalString,
  department_id: optionalString,
  role_id: optionalString,
  user_id: optionalString,
  permission_key: optionalString,
  min_level: z.coerce.number().int().min(1).max(4).optional().nullable(),
  max_level: z.coerce.number().int().min(1).max(4).optional().nullable(),
  required_permission: optionalString,
  required_role_id: optionalString,
  requires_approval: boolish.transform(bool),
  use_requester_department: boolish.transform(bool),
  use_subject_department: boolish.transform(bool),
  fallback_behavior: z.enum(OPERATION_RESPONSIBILITY_FALLBACKS).default("HOLD_FOR_MANUAL_ASSIGNMENT"),
  priority: z.coerce.number().int().min(1).max(999).default(100),
  is_required: boolish.transform(bool),
  is_active: boolish.transform(bool),
  effective_from: optionalString,
  effective_to: optionalString,
});

const validateResponsibilityTarget = (value: z.infer<typeof responsibilityBaseSchema>, ctx: z.RefinementCtx) => {
  const targets = [value.business_function_id, value.department_id, value.user_id].filter(Boolean);
  if (targets.length > 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose exactly one target model.", path: ["target_type"] });
  if (value.min_level && value.max_level && value.min_level > value.max_level) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Minimum level cannot be greater than maximum level.", path: ["min_level"] });
  }
  if (value.target_type === "BUSINESS_FUNCTION" && !value.business_function_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Business function target is required.", path: ["business_function_id"] });
  if (value.target_type === "BUSINESS_FUNCTION" && (value.department_id || value.user_id || value.use_requester_department || value.use_subject_department)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Business function target cannot include department, user, or dynamic department flags.", path: ["target_type"] });
  if (value.target_type === "DEPARTMENT" && !value.department_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Department target is required.", path: ["department_id"] });
  if (value.target_type === "DEPARTMENT" && (value.business_function_id || value.user_id || value.use_requester_department || value.use_subject_department)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Department target cannot include business function, user, or dynamic department flags.", path: ["target_type"] });
  if (value.target_type === "SPECIFIC_USER" && !value.user_id) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specific user target is required.", path: ["user_id"] });
  if (value.target_type === "SPECIFIC_USER" && (value.business_function_id || value.department_id || value.use_requester_department || value.use_subject_department)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specific user target cannot include business function, department, or dynamic department flags.", path: ["target_type"] });
  if (value.target_type === "REQUESTER_DEPARTMENT" && (value.business_function_id || value.department_id || value.user_id || value.use_subject_department)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requester department target cannot include static targets.", path: ["target_type"] });
  if (value.target_type === "SUBJECT_DEPARTMENT" && (value.business_function_id || value.department_id || value.user_id || value.use_requester_department)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Subject department target cannot include static targets.", path: ["target_type"] });
  if (value.target_type === "SUPER_ADMIN" && (value.business_function_id || value.department_id || value.user_id || value.use_requester_department || value.use_subject_department)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Super Admin target cannot include other targets.", path: ["target_type"] });
};

const responsibilitySchema = responsibilityBaseSchema.superRefine(validateResponsibilityTarget);

const resolutionSchema = z.object({
  operation_code: z.string().trim().min(2).max(100).transform((value) => value.toUpperCase()),
  responsibility_type: z.enum(OPERATION_RESPONSIBILITY_TYPES),
  requester_employee_id: optionalString,
  subject_employee_id: optionalString,
  department_id: optionalString,
  fallback_behavior: z.enum(OPERATION_RESPONSIBILITY_FALLBACKS).optional(),
});

export const validateOwnershipFilters = (value: unknown): OwnershipFilters => filtersSchema.parse(value) as OwnershipFilters;
export const validateBusinessFunctionInput = (value: unknown): BusinessFunctionInput => businessFunctionSchema.parse(value) as BusinessFunctionInput;
export const validateBusinessFunctionUpdateInput = (value: unknown): Partial<BusinessFunctionInput> => businessFunctionSchema.partial().parse(value) as Partial<BusinessFunctionInput>;
export const validateAssignmentInput = (value: unknown): FunctionDepartmentAssignmentInput => assignmentSchema.parse(value) as FunctionDepartmentAssignmentInput;
export const validateAssignmentUpdateInput = (value: unknown): Partial<FunctionDepartmentAssignmentInput> => assignmentSchema.partial().parse(value) as Partial<FunctionDepartmentAssignmentInput>;
export const validateOperationInput = (value: unknown): OperationCatalogInput => operationSchema.parse(value) as OperationCatalogInput;
export const validateOperationUpdateInput = (value: unknown): Partial<OperationCatalogInput> => operationSchema.partial().parse(value) as Partial<OperationCatalogInput>;
export const validateResponsibilityInput = (value: unknown): OperationResponsibilityInput => responsibilitySchema.parse(value) as OperationResponsibilityInput;
export const validateResponsibilityUpdateInput = (value: unknown): Partial<OperationResponsibilityInput> => responsibilityBaseSchema.partial().parse(value) as Partial<OperationResponsibilityInput>;
export const validateResolutionInput = (value: unknown): OperationResolutionInput => resolutionSchema.parse(value) as OperationResolutionInput;
