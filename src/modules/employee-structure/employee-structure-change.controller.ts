import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";
import * as service from "./employee-structure-change.service";
import {
  validateEmployeeStructureChangeAction,
  validateEmployeeStructureChangeFilters,
  validateEmployeeStructureChangeRequest,
} from "./employee-structure-change.validators";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const requestId = (c: Context<AppContext>) => {
  const id = c.req.param("requestId");
  if (!id) throw new ValidationError("Employee structure change request is required.");
  return id;
};
const query = (c: Context<AppContext>) => ({
  employee_id: c.req.query("employee_id"),
  operation_type: c.req.query("operation_type"),
  request_type: c.req.query("request_type"),
  status: c.req.query("status"),
  department_id: c.req.query("department_id"),
  search: c.req.query("search"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listEmployeeStructureChangeRequests = async (c: Context<AppContext>) => {
  const result = await service.listEmployeeStructureChangeRequests(c.env, actor(c), validateEmployeeStructureChangeFilters(query(c)));
  return paginated(result.rows, result.pagination, "Employee structure change requests loaded successfully.", { requestId: c.get("requestId") });
};

export const createEmployeeStructureChangeRequest = async (c: Context<AppContext>) =>
  created(await service.createEmployeeStructureChangeRequest(c.env, actor(c), validateEmployeeStructureChangeRequest(await body(c))), "Employee structure change request created successfully.", { requestId: c.get("requestId") });

export const getEmployeeStructureChangeRequest = async (c: Context<AppContext>) =>
  ok(await service.getEmployeeStructureChangeRequest(c.env, actor(c), requestId(c)), "Employee structure change request loaded successfully.", { requestId: c.get("requestId") });

export const submitEmployeeStructureChangeRequest = async (c: Context<AppContext>) =>
  ok(await service.submitEmployeeStructureChangeForApproval(c.env, actor(c), requestId(c)), "Employee structure change request submitted for approval.", { requestId: c.get("requestId") });

export const approveEmployeeStructureChangeRequest = async (c: Context<AppContext>) =>
  ok(await service.approveEmployeeStructureChangeStep(c.env, actor(c), requestId(c), validateEmployeeStructureChangeAction(await body(c))), "Employee structure change request approved.", { requestId: c.get("requestId") });

export const rejectEmployeeStructureChangeRequest = async (c: Context<AppContext>) =>
  ok(await service.rejectEmployeeStructureChangeStep(c.env, actor(c), requestId(c), validateEmployeeStructureChangeAction(await body(c))), "Employee structure change request rejected.", { requestId: c.get("requestId") });

export const cancelEmployeeStructureChangeRequest = async (c: Context<AppContext>) =>
  ok(await service.cancelEmployeeStructureChangeRequest(c.env, actor(c), requestId(c), validateEmployeeStructureChangeAction(await body(c))), "Employee structure change request cancelled.", { requestId: c.get("requestId") });

export const applyEmployeeStructureChangeRequest = async (c: Context<AppContext>) =>
  ok(await service.applyApprovedEmployeeStructureChangeRequest(c.env, actor(c), requestId(c), validateEmployeeStructureChangeAction(await body(c))), "Employee structure change request applied.", { requestId: c.get("requestId") });

export const employeeStructureChangeTimeline = async (c: Context<AppContext>) =>
  ok(await service.getEmployeeStructureChangeTimeline(c.env, actor(c), requestId(c)), "Employee structure change request timeline loaded successfully.", { requestId: c.get("requestId") });

export const employeeStructureChangeItems = async (c: Context<AppContext>) =>
  ok(await service.listEmployeeStructureChangeItems(c.env, actor(c), requestId(c)), "Employee structure change request items loaded successfully.", { requestId: c.get("requestId") });

export const employeeStructureChangeAudit = async (c: Context<AppContext>) =>
  ok(await service.getEmployeeStructureChangeAudit(c.env, actor(c), requestId(c)), "Employee structure change request audit loaded successfully.", { requestId: c.get("requestId") });
