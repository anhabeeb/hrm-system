import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";
import * as service from "./employee-discipline.service";
import { validateDisciplinaryActionCommand, validateDisciplinaryActionFilters, validateDisciplinaryActionInput } from "./employee-discipline.validators";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const requestId = (c: Context<AppContext>) => {
  const id = c.req.param("requestId") || c.req.param("id");
  if (!id) throw new ValidationError("Disciplinary action request is required.");
  return id;
};
const taskId = (c: Context<AppContext>) => {
  const id = c.req.param("taskId");
  if (!id) throw new ValidationError("Disciplinary follow-up task is required.");
  return id;
};
const recordId = (c: Context<AppContext>) => {
  const id = c.req.param("recordId");
  if (!id) throw new ValidationError("Disciplinary record is required.");
  return id;
};
const query = (c: Context<AppContext>) => ({
  employee_id: c.req.query("employee_id"),
  department_id: c.req.query("department_id"),
  outlet_id: c.req.query("outlet_id"),
  request_type: c.req.query("request_type"),
  action_type: c.req.query("action_type"),
  severity: c.req.query("severity"),
  status: c.req.query("status"),
  approval_status: c.req.query("approval_status"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listDisciplinaryActions = async (c: Context<AppContext>) => {
  const result = await service.listDisciplinaryActions(c.env, actor(c), validateDisciplinaryActionFilters(query(c)));
  return paginated(result.rows, result.pagination, "Disciplinary action requests loaded successfully.", { requestId: c.get("requestId") });
};

export const createDisciplinaryAction = async (c: Context<AppContext>) =>
  created(await service.createDisciplinaryAction(c.env, actor(c), validateDisciplinaryActionInput(await body(c))), "Disciplinary action request created successfully.", { requestId: c.get("requestId") });

export const getDisciplinaryAction = async (c: Context<AppContext>) =>
  ok(await service.getDisciplinaryAction(c.env, actor(c), requestId(c)), "Disciplinary action request loaded successfully.", { requestId: c.get("requestId") });

export const listDisciplinaryRecords = async (c: Context<AppContext>) => {
  const result = await service.listDisciplinaryRecords(c.env, actor(c), validateDisciplinaryActionFilters(query(c)));
  return paginated(result.rows, result.pagination, "Disciplinary records loaded successfully.", { requestId: c.get("requestId") });
};

export const getDisciplinaryRecord = async (c: Context<AppContext>) =>
  ok(await service.getDisciplinaryRecord(c.env, actor(c), recordId(c)), "Disciplinary record loaded successfully.", { requestId: c.get("requestId") });

export const submitDisciplinaryAction = async (c: Context<AppContext>) =>
  ok(await service.submitDisciplinaryActionForApproval(c.env, actor(c), requestId(c)), "Disciplinary action submitted for approval.", { requestId: c.get("requestId") });

export const approveDisciplinaryAction = async (c: Context<AppContext>) =>
  ok(await service.approveDisciplinaryActionStep(c.env, actor(c), requestId(c), validateDisciplinaryActionCommand(await body(c))), "Disciplinary action approval recorded successfully.", { requestId: c.get("requestId") });

export const rejectDisciplinaryAction = async (c: Context<AppContext>) =>
  ok(await service.rejectDisciplinaryActionStep(c.env, actor(c), requestId(c), validateDisciplinaryActionCommand(await body(c))), "Disciplinary action rejected successfully.", { requestId: c.get("requestId") });

export const cancelDisciplinaryAction = async (c: Context<AppContext>) =>
  ok(await service.cancelDisciplinaryAction(c.env, actor(c), requestId(c), validateDisciplinaryActionCommand(await body(c))), "Disciplinary action cancelled successfully.", { requestId: c.get("requestId") });

export const applyDisciplinaryAction = async (c: Context<AppContext>) =>
  ok(await service.applyApprovedDisciplinaryAction(c.env, actor(c), requestId(c), validateDisciplinaryActionCommand(await body(c))), "Disciplinary action apply action completed.", { requestId: c.get("requestId") });

export const acknowledgeDisciplinaryAction = async (c: Context<AppContext>) =>
  ok(await service.acknowledgeDisciplinaryAction(c.env, actor(c), requestId(c), validateDisciplinaryActionCommand(await body(c))), "Disciplinary action acknowledged successfully.", { requestId: c.get("requestId") });

export const closeDisciplinaryAction = async (c: Context<AppContext>) =>
  ok(await service.closeDisciplinaryAction(c.env, actor(c), requestId(c), validateDisciplinaryActionCommand(await body(c))), "Disciplinary action closed successfully.", { requestId: c.get("requestId") });

export const disciplinaryTimeline = async (c: Context<AppContext>) =>
  ok(await service.getDisciplinaryTimeline(c.env, actor(c), requestId(c)), "Disciplinary action timeline loaded successfully.", { requestId: c.get("requestId") });

export const disciplinaryTasks = async (c: Context<AppContext>) =>
  ok(await service.listDisciplinaryTasks(c.env, actor(c), requestId(c)), "Disciplinary follow-up tasks loaded successfully.", { requestId: c.get("requestId") });

export const disciplinaryItems = async (c: Context<AppContext>) =>
  ok(await service.listDisciplinaryItems(c.env, actor(c), requestId(c)), "Disciplinary evidence items loaded successfully.", { requestId: c.get("requestId") });

export const completeDisciplinaryTask = async (c: Context<AppContext>) =>
  ok(await service.completeDisciplinaryTask(c.env, actor(c), requestId(c), taskId(c), validateDisciplinaryActionCommand(await body(c))), "Disciplinary follow-up task completed successfully.", { requestId: c.get("requestId") });

export const waiveDisciplinaryTask = async (c: Context<AppContext>) =>
  ok(await service.waiveDisciplinaryTask(c.env, actor(c), requestId(c), taskId(c), validateDisciplinaryActionCommand(await body(c))), "Disciplinary follow-up task waived successfully.", { requestId: c.get("requestId") });

export const disciplinaryAudit = async (c: Context<AppContext>) =>
  ok(await service.getDisciplinaryAudit(c.env, actor(c), requestId(c)), "Disciplinary action audit loaded successfully.", { requestId: c.get("requestId") });
