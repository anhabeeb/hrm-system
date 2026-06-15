import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";
import * as service from "./employee-exit.service";
import { validateEmployeeExitAction, validateEmployeeExitFilters, validateEmployeeExitRequest } from "./employee-exit.validators";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const requestId = (c: Context<AppContext>) => {
  const id = c.req.param("requestId");
  if (!id) throw new ValidationError("Resignation or offboarding request is required.");
  return id;
};
const taskId = (c: Context<AppContext>) => {
  const id = c.req.param("taskId");
  if (!id) throw new ValidationError("Offboarding task is required.");
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

export const listEmployeeExitRequests = async (c: Context<AppContext>) => {
  const result = await service.listEmployeeExitRequests(c.env, actor(c), validateEmployeeExitFilters(query(c)));
  return paginated(result.rows, result.pagination, "Resignation and offboarding requests loaded successfully.", { requestId: c.get("requestId") });
};

export const createEmployeeExitRequest = async (c: Context<AppContext>) =>
  created(await service.createEmployeeExitRequest(c.env, actor(c), validateEmployeeExitRequest(await body(c))), "Resignation or offboarding request created successfully.", { requestId: c.get("requestId") });

export const getEmployeeExitRequest = async (c: Context<AppContext>) =>
  ok(await service.getEmployeeExitRequest(c.env, actor(c), requestId(c)), "Resignation or offboarding request loaded successfully.", { requestId: c.get("requestId") });

export const submitEmployeeExitRequest = async (c: Context<AppContext>) =>
  ok(await service.submitEmployeeExitForApproval(c.env, actor(c), requestId(c)), "Resignation or offboarding request submitted for approval.", { requestId: c.get("requestId") });

export const approveEmployeeExitRequest = async (c: Context<AppContext>) =>
  ok(await service.approveEmployeeExitStep(c.env, actor(c), requestId(c), validateEmployeeExitAction(await body(c))), "Resignation or offboarding request approved.", { requestId: c.get("requestId") });

export const rejectEmployeeExitRequest = async (c: Context<AppContext>) =>
  ok(await service.rejectEmployeeExitStep(c.env, actor(c), requestId(c), validateEmployeeExitAction(await body(c))), "Resignation or offboarding request rejected.", { requestId: c.get("requestId") });

export const cancelEmployeeExitRequest = async (c: Context<AppContext>) =>
  ok(await service.cancelEmployeeExitRequest(c.env, actor(c), requestId(c), validateEmployeeExitAction(await body(c))), "Resignation or offboarding request cancelled or withdrawn.", { requestId: c.get("requestId") });

export const applyEmployeeExitRequest = async (c: Context<AppContext>) =>
  ok(await service.applyApprovedEmployeeExitRequest(c.env, actor(c), requestId(c), validateEmployeeExitAction(await body(c))), "Resignation or offboarding request applied.", { requestId: c.get("requestId") });

export const completeEmployeeExitRequest = async (c: Context<AppContext>) =>
  ok(await service.completeEmployeeExitOffboarding(c.env, actor(c), requestId(c), validateEmployeeExitAction(await body(c))), "Offboarding completed successfully.", { requestId: c.get("requestId") });

export const employeeExitTimeline = async (c: Context<AppContext>) =>
  ok(await service.getEmployeeExitTimeline(c.env, actor(c), requestId(c)), "Resignation or offboarding timeline loaded successfully.", { requestId: c.get("requestId") });

export const employeeExitTasks = async (c: Context<AppContext>) =>
  ok(await service.listEmployeeExitTasks(c.env, actor(c), requestId(c)), "Offboarding tasks loaded successfully.", { requestId: c.get("requestId") });

export const completeEmployeeExitTask = async (c: Context<AppContext>) =>
  ok(await service.completeEmployeeExitTask(c.env, actor(c), requestId(c), taskId(c), validateEmployeeExitAction(await body(c), false)), "Offboarding task completed successfully.", { requestId: c.get("requestId") });

export const waiveEmployeeExitTask = async (c: Context<AppContext>) =>
  ok(await service.waiveEmployeeExitTask(c.env, actor(c), requestId(c), taskId(c), validateEmployeeExitAction(await body(c))), "Offboarding task waived successfully.", { requestId: c.get("requestId") });

export const employeeExitAudit = async (c: Context<AppContext>) =>
  ok(await service.getEmployeeExitAudit(c.env, actor(c), requestId(c)), "Resignation or offboarding audit loaded successfully.", { requestId: c.get("requestId") });
