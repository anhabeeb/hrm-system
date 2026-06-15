import type { Context } from "hono";

import * as service from "./operation-ownership.service";
import {
  validateAssignmentInput,
  validateAssignmentUpdateInput,
  validateBusinessFunctionInput,
  validateBusinessFunctionUpdateInput,
  validateOperationInput,
  validateOperationUpdateInput,
  validateOwnershipFilters,
  validateResolutionInput,
  validateResponsibilityInput,
  validateResponsibilityUpdateInput,
} from "./operation-ownership.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const id = (c: Context<AppContext>) => {
  const value = c.req.param("id");
  if (!value) throw new ValidationError("Record id is required.");
  return value;
};
const operationCode = (c: Context<AppContext>) => {
  const value = c.req.param("operationCode");
  if (!value) throw new ValidationError("Operation code is required.");
  return value;
};
const filters = (c: Context<AppContext>, extra: Record<string, string | undefined> = {}) => validateOwnershipFilters({
  search: c.req.query("search"),
  status: c.req.query("status"),
  operation_code: c.req.query("operation_code"),
  module_key: c.req.query("module_key"),
  business_function_id: c.req.query("business_function_id"),
  responsibility_type: c.req.query("responsibility_type"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
  ...extra,
});

export const listBusinessFunctions = async (c: Context<AppContext>) => {
  const result = await service.listBusinessFunctions(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Business functions loaded successfully.", { requestId: c.get("requestId") });
};
export const createBusinessFunction = async (c: Context<AppContext>) => created(await service.createBusinessFunction(c.env, actor(c), validateBusinessFunctionInput(await body(c))), "Business function created successfully.", { requestId: c.get("requestId") });
export const getBusinessFunction = async (c: Context<AppContext>) => ok({ business_function: await service.getBusinessFunction(c.env, actor(c), id(c)) }, "Business function loaded successfully.", { requestId: c.get("requestId") });
export const updateBusinessFunction = async (c: Context<AppContext>) => ok(await service.updateBusinessFunction(c.env, actor(c), id(c), validateBusinessFunctionUpdateInput(await body(c))), "Business function updated successfully.", { requestId: c.get("requestId") });
export const disableBusinessFunction = async (c: Context<AppContext>) => ok(await service.setBusinessFunctionStatus(c.env, actor(c), id(c), false), "Business function disabled successfully.", { requestId: c.get("requestId") });
export const enableBusinessFunction = async (c: Context<AppContext>) => ok(await service.setBusinessFunctionStatus(c.env, actor(c), id(c), true), "Business function enabled successfully.", { requestId: c.get("requestId") });
export const archiveBusinessFunction = async (c: Context<AppContext>) => ok(await service.setBusinessFunctionStatus(c.env, actor(c), id(c), false, true), "Business function archived successfully.", { requestId: c.get("requestId") });

export const listFunctionAssignments = async (c: Context<AppContext>) => {
  const result = await service.listFunctionAssignments(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Function department assignments loaded successfully.", { requestId: c.get("requestId") });
};
export const createFunctionAssignment = async (c: Context<AppContext>) => created(await service.createFunctionAssignment(c.env, actor(c), validateAssignmentInput(await body(c))), "Function department assignment created successfully.", { requestId: c.get("requestId") });
export const updateFunctionAssignment = async (c: Context<AppContext>) => ok(await service.updateFunctionAssignment(c.env, actor(c), id(c), validateAssignmentUpdateInput(await body(c))), "Function department assignment updated successfully.", { requestId: c.get("requestId") });
export const disableFunctionAssignment = async (c: Context<AppContext>) => ok(await service.setFunctionAssignmentStatus(c.env, actor(c), id(c), false), "Function department assignment disabled successfully.", { requestId: c.get("requestId") });
export const enableFunctionAssignment = async (c: Context<AppContext>) => ok(await service.setFunctionAssignmentStatus(c.env, actor(c), id(c), true), "Function department assignment enabled successfully.", { requestId: c.get("requestId") });
export const archiveFunctionAssignment = async (c: Context<AppContext>) => ok(await service.setFunctionAssignmentStatus(c.env, actor(c), id(c), false, true), "Function department assignment archived successfully.", { requestId: c.get("requestId") });

export const listOperations = async (c: Context<AppContext>) => {
  const result = await service.listOperations(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Operation catalog loaded successfully.", { requestId: c.get("requestId") });
};
export const createOperation = async (c: Context<AppContext>) => created(await service.createOperation(c.env, actor(c), validateOperationInput(await body(c))), "Operation catalog entry created successfully.", { requestId: c.get("requestId") });
export const getOperation = async (c: Context<AppContext>) => ok({ operation: await service.getOperation(c.env, actor(c), operationCode(c)) }, "Operation catalog entry loaded successfully.", { requestId: c.get("requestId") });
export const updateOperation = async (c: Context<AppContext>) => ok(await service.updateOperation(c.env, actor(c), operationCode(c), validateOperationUpdateInput(await body(c))), "Operation catalog entry updated successfully.", { requestId: c.get("requestId") });
export const disableOperation = async (c: Context<AppContext>) => ok(await service.setOperationStatus(c.env, actor(c), operationCode(c), false), "Operation catalog entry disabled successfully.", { requestId: c.get("requestId") });
export const enableOperation = async (c: Context<AppContext>) => ok(await service.setOperationStatus(c.env, actor(c), operationCode(c), true), "Operation catalog entry enabled successfully.", { requestId: c.get("requestId") });
export const archiveOperation = async (c: Context<AppContext>) => ok(await service.setOperationStatus(c.env, actor(c), operationCode(c), false, true), "Operation catalog entry archived successfully.", { requestId: c.get("requestId") });

export const listResponsibilities = async (c: Context<AppContext>) => {
  const result = await service.listResponsibilities(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Operation responsibilities loaded successfully.", { requestId: c.get("requestId") });
};
export const listOperationResponsibilities = async (c: Context<AppContext>) => {
  const result = await service.listOperationResponsibilities(c.env, actor(c), operationCode(c), filters(c, { operation_code: operationCode(c) }));
  return paginated(result.rows, result.pagination, "Operation responsibilities loaded successfully.", { requestId: c.get("requestId") });
};
export const createResponsibility = async (c: Context<AppContext>) => created(await service.createResponsibility(c.env, actor(c), validateResponsibilityInput(await body(c))), "Operation responsibility created successfully.", { requestId: c.get("requestId") });
export const createOperationResponsibility = async (c: Context<AppContext>) => {
  const payload = { ...((await body(c)) as Record<string, unknown>), operation_code: operationCode(c) };
  return created(await service.createResponsibility(c.env, actor(c), validateResponsibilityInput(payload)), "Operation responsibility created successfully.", { requestId: c.get("requestId") });
};
export const getResponsibility = async (c: Context<AppContext>) => ok({ responsibility: await service.getResponsibility(c.env, actor(c), id(c)) }, "Operation responsibility loaded successfully.", { requestId: c.get("requestId") });
export const updateResponsibility = async (c: Context<AppContext>) => ok(await service.updateResponsibility(c.env, actor(c), id(c), validateResponsibilityUpdateInput(await body(c))), "Operation responsibility updated successfully.", { requestId: c.get("requestId") });
export const disableResponsibility = async (c: Context<AppContext>) => ok(await service.setResponsibilityStatus(c.env, actor(c), id(c), false), "Operation responsibility disabled successfully.", { requestId: c.get("requestId") });
export const enableResponsibility = async (c: Context<AppContext>) => ok(await service.setResponsibilityStatus(c.env, actor(c), id(c), true), "Operation responsibility enabled successfully.", { requestId: c.get("requestId") });
export const archiveResponsibility = async (c: Context<AppContext>) => ok(await service.setResponsibilityStatus(c.env, actor(c), id(c), false, true), "Operation responsibility archived successfully.", { requestId: c.get("requestId") });
export const resolveResponsibility = async (c: Context<AppContext>) => ok({ resolution: await service.resolveOperationResponsibility(c.env, actor(c), validateResolutionInput(await body(c))) }, "Operation responsibility resolved successfully.", { requestId: c.get("requestId") });
export const getMatrixSummary = async (c: Context<AppContext>) => ok({ summary: await service.getMatrixSummary(c.env, actor(c)) }, "Operation ownership matrix summary loaded successfully.", { requestId: c.get("requestId") });
export const getSetupWarnings = async (c: Context<AppContext>) => ok(await service.getSetupWarnings(c.env, actor(c)), "Operation ownership setup warnings loaded successfully.", { requestId: c.get("requestId") });
