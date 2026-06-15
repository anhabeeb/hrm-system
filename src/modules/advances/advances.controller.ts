import type { Context } from "hono";

import * as service from "./advances.service";
import * as advanceSalaryService from "./advance-salary.service";
import { validateAdvanceSalaryAction, validateAdvanceSalaryFilters, validateAdvanceSalaryInput, validateAdvanceSalaryPayment } from "./advance-salary.validators";
import { validateAdvanceAction, validateAdvanceCreate, validateAdvanceFilters, validateAdvanceUpdate } from "./advances.validators";
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
  if (!value) throw new ValidationError("Advance payment is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  status: c.req.query("status"),
  deduction_month: c.req.query("deduction_month"),
  date_from: c.req.query("date_from"),
  date_to: c.req.query("date_to"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});
const salaryQuery = (c: Context<AppContext>) => ({
  employee_id: c.req.query("employee_id"),
  department_id: c.req.query("department_id"),
  outlet_id: c.req.query("outlet_id"),
  request_type: c.req.query("request_type"),
  status: c.req.query("status"),
  payment_status: c.req.query("payment_status"),
  deduction_status: c.req.query("deduction_status"),
  approval_status: c.req.query("approval_status"),
  payroll_month: c.req.query("payroll_month"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listAdvances = async (c: Context<AppContext>) => {
  const result = await service.listAdvances(c.env, actor(c), validateAdvanceFilters(query(c)));
  return paginated(result.rows, result.pagination, "Advance payments loaded successfully.", { requestId: c.get("requestId") });
};
export const getAdvance = async (c: Context<AppContext>) => ok({ advance: await service.getAdvance(c.env, actor(c), id(c)) }, "Advance payment loaded successfully.", { requestId: c.get("requestId") });
export const createAdvance = async (c: Context<AppContext>) => created(await service.createAdvance(c.env, actor(c), validateAdvanceCreate(await body(c))), "Advance payment requested successfully.", { requestId: c.get("requestId") });
export const updateAdvance = async (c: Context<AppContext>) => ok(await service.updateAdvance(c.env, actor(c), id(c), validateAdvanceUpdate(await body(c))), "Advance payment updated successfully.", { requestId: c.get("requestId") });
export const approveAdvance = async (c: Context<AppContext>) => ok(await service.approveAdvance(c.env, actor(c), id(c), validateAdvanceAction(await body(c))), "Advance payment approved.", { requestId: c.get("requestId") });
export const rejectAdvance = async (c: Context<AppContext>) => ok(await service.rejectAdvance(c.env, actor(c), id(c), validateAdvanceAction(await body(c))), "Advance payment rejected.", { requestId: c.get("requestId") });

export const listSalaryRequests = async (c: Context<AppContext>) => {
  const result = await advanceSalaryService.listAdvanceSalaryRequests(c.env, actor(c), validateAdvanceSalaryFilters(salaryQuery(c)));
  return paginated(result.rows, result.pagination, "Advance salary requests loaded successfully.", { requestId: c.get("requestId") });
};
export const getSalaryRequest = async (c: Context<AppContext>) => ok(await advanceSalaryService.getAdvanceSalaryRequest(c.env, actor(c), id(c)), "Advance salary request loaded successfully.", { requestId: c.get("requestId") });
export const createSalaryRequest = async (c: Context<AppContext>) => created(await advanceSalaryService.createAdvanceSalaryRequest(c.env, actor(c), validateAdvanceSalaryInput(await body(c))), "Advance salary request created successfully.", { requestId: c.get("requestId") });
export const submitSalaryRequest = async (c: Context<AppContext>) => ok(await advanceSalaryService.submitAdvanceSalaryForApproval(c.env, actor(c), id(c)), "Advance salary request submitted for approval.", { requestId: c.get("requestId") });
export const approveSalaryRequest = async (c: Context<AppContext>) => ok(await advanceSalaryService.approveAdvanceSalaryStep(c.env, actor(c), id(c), validateAdvanceSalaryAction(await body(c))), "Advance salary approval step approved.", { requestId: c.get("requestId") });
export const rejectSalaryRequest = async (c: Context<AppContext>) => ok(await advanceSalaryService.rejectAdvanceSalaryStep(c.env, actor(c), id(c), validateAdvanceSalaryAction(await body(c))), "Advance salary request rejected.", { requestId: c.get("requestId") });
export const cancelSalaryRequest = async (c: Context<AppContext>) => ok(await advanceSalaryService.cancelAdvanceSalaryRequest(c.env, actor(c), id(c), validateAdvanceSalaryAction(await body(c))), "Advance salary request cancelled.", { requestId: c.get("requestId") });
export const executeSalaryPayment = async (c: Context<AppContext>) => ok(await advanceSalaryService.executeAdvanceSalaryPayment(c.env, actor(c), id(c), validateAdvanceSalaryPayment(await body(c))), "Advance salary payment executed.", { requestId: c.get("requestId") });
export const salaryRequestDeductions = async (c: Context<AppContext>) => ok(await advanceSalaryService.getAdvanceSalaryDeductions(c.env, actor(c), id(c)), "Advance salary deductions loaded successfully.", { requestId: c.get("requestId") });
export const salaryRequestTimeline = async (c: Context<AppContext>) => ok(await advanceSalaryService.getAdvanceSalaryTimeline(c.env, actor(c), id(c)), "Advance salary timeline loaded successfully.", { requestId: c.get("requestId") });
