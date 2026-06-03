import type { Context } from "hono";

import * as service from "./salary-loans.service";
import { validateLoanAction, validateLoanCreate, validateLoanFilters, validateLoanUpdate } from "./salary-loans.validators";
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
  if (!value) throw new ValidationError("Salary loan is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  status: c.req.query("status"),
  start_month: c.req.query("start_month"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listLoans = async (c: Context<AppContext>) => {
  const result = await service.listLoans(c.env, actor(c), validateLoanFilters(query(c)));
  return paginated(result.rows, result.pagination, "Salary loans loaded successfully.", { requestId: c.get("requestId") });
};
export const getLoan = async (c: Context<AppContext>) => ok({ salary_loan: await service.getLoan(c.env, actor(c), id(c)) }, "Salary loan loaded successfully.", { requestId: c.get("requestId") });
export const createLoan = async (c: Context<AppContext>) => created(await service.createLoan(c.env, actor(c), validateLoanCreate(await body(c))), "Salary loan created successfully.", { requestId: c.get("requestId") });
export const updateLoan = async (c: Context<AppContext>) => ok(await service.updateLoan(c.env, actor(c), id(c), validateLoanUpdate(await body(c))), "Salary loan updated successfully.", { requestId: c.get("requestId") });
export const approveLoan = async (c: Context<AppContext>) => ok(await service.approveLoan(c.env, actor(c), id(c), validateLoanAction(await body(c))), "Salary loan approved.", { requestId: c.get("requestId") });
export const pauseLoan = async (c: Context<AppContext>) => ok(await service.pauseLoan(c.env, actor(c), id(c), validateLoanAction(await body(c))), "Salary loan paused.", { requestId: c.get("requestId") });
export const settleLoan = async (c: Context<AppContext>) => ok(await service.settleLoan(c.env, actor(c), id(c), validateLoanAction(await body(c))), "Salary loan settled.", { requestId: c.get("requestId") });
export const listInstallments = async (c: Context<AppContext>) => ok({ installments: await service.listInstallments(c.env, actor(c), id(c)) }, "Salary loan installments loaded successfully.", { requestId: c.get("requestId") });
