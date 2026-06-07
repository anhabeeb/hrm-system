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
const param = (c: Context<AppContext>, name: string, message: string) => {
  const value = c.req.param(name);
  if (!value) throw new ValidationError(message);
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
export const downloadPayslip = async (c: Context<AppContext>) => ok(await service.downloadPayslip(c.env, actor(c), id(c)), "Payslip download prepared successfully.", { requestId: c.get("requestId") });
export const printPayslip = async (c: Context<AppContext>) => new Response(
  await service.printPayslip(c.env, actor(c), id(c)),
  {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Request-ID": c.get("requestId") ?? "",
    },
  },
);
export const downloadPlaceholder = downloadPayslip;

export const listRunPayslips = async (c: Context<AppContext>) => {
  const result = await service.listRunPayslips(
    c.env,
    actor(c),
    param(c, "id", "Payroll run is required."),
    validatePayslipFilters(query(c)),
  );
  return paginated(result.rows, result.pagination, "Payroll run payslips loaded successfully.", { requestId: c.get("requestId") });
};
export const getRunPayslip = async (c: Context<AppContext>) => ok(
  {
    payslip: await service.getRunPayslip(
      c.env,
      actor(c),
      param(c, "id", "Payroll run is required."),
      param(c, "payslipId", "Payslip is required."),
    ),
  },
  "Payslip loaded successfully.",
  { requestId: c.get("requestId") },
);
export const listEmployeePayslips = async (c: Context<AppContext>) => {
  const result = await service.listEmployeePayslips(
    c.env,
    actor(c),
    param(c, "id", "Employee is required."),
    validatePayslipFilters(query(c)),
  );
  return paginated(result.rows, result.pagination, "Employee payslips loaded successfully.", { requestId: c.get("requestId") });
};
