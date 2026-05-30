import type { Context } from "hono";

import * as service from "./payslips.service";
import { validatePayslipFilters, validatePayslipGenerate } from "./payslips.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const id = (c: Context<AppContext>) => {
  const value = c.req.param("id");
  if (!value) throw new ValidationError("Payslip is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  payroll_run_id: c.req.query("payroll_run_id"),
  payroll_month: c.req.query("payroll_month"),
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  status: c.req.query("status"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});
export const generateBatch = async (c: Context<AppContext>) => ok(await service.generateBatch(c.env, actor(c), validatePayslipGenerate(await body(c))), "Payslips generated successfully.", { requestId: c.get("requestId") });
export const listPayslips = async (c: Context<AppContext>) => {
  const result = await service.listPayslips(c.env, actor(c), validatePayslipFilters(query(c)));
  return paginated(result.rows, result.pagination, "Payslips loaded successfully.", { requestId: c.get("requestId") });
};
export const getPayslip = async (c: Context<AppContext>) => ok({ payslip: await service.getPayslip(c.env, actor(c), id(c)) }, "Payslip loaded successfully.", { requestId: c.get("requestId") });
export const downloadPlaceholder = async (c: Context<AppContext>) => ok(await service.downloadPlaceholder(c.env, actor(c), id(c)), "Payslip PDF generation is not available yet.", { requestId: c.get("requestId") });
