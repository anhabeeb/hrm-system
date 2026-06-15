import type { Context } from "hono";

import * as service from "./payroll.service";
import * as adjustmentService from "./payroll-adjustments.service";
import {
  validatePayrollAdjustmentAction,
  validatePayrollAdjustmentFilters,
  validatePayrollAdjustmentInput,
} from "./payroll-adjustments.validators";
import {
  requirePayrollMonth,
  validateExceptionFilters,
  validateExceptionResolve,
  validateItemFilters,
  validatePayrollAction,
  validatePayrollCalculateInput,
  validatePayrollListFilters,
} from "./payroll.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const id = (c: Context<AppContext>, name = "id") => {
  const value = c.req.param(name);
  if (!value) throw new ValidationError("Payroll record is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  payroll_month: c.req.query("payroll_month"),
  status: c.req.query("status"),
  outlet_id: c.req.query("outlet_id"),
  payroll_run_id: c.req.query("payroll_run_id"),
  effective_payroll_month: c.req.query("effective_payroll_month"),
  approval_status: c.req.query("approval_status"),
  date_from: c.req.query("date_from"),
  date_to: c.req.query("date_to"),
  employee_id: c.req.query("employee_id"),
  exception_type: c.req.query("exception_type"),
  severity: c.req.query("severity"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
  sort_by: c.req.query("sort_by"),
  sort_direction: c.req.query("sort_direction"),
});

export const listPayroll = async (c: Context<AppContext>) => {
  const result = await service.listPayroll(c.env, actor(c), validatePayrollListFilters(query(c)));
  return paginated(result.rows, result.pagination, "Payroll runs loaded successfully.", { requestId: c.get("requestId") });
};

export const getPayroll = async (c: Context<AppContext>) =>
  ok({ payroll_run: await service.getPayroll(c.env, actor(c), id(c)) }, "Payroll run loaded successfully.", { requestId: c.get("requestId") });

export const getPayrollByMonth = async (c: Context<AppContext>) =>
  ok(
    { payroll_run: await service.getPayrollByMonth(c.env, actor(c), requirePayrollMonth(c.req.param("payrollMonth"))) },
    "Payroll run loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const calculate = async (c: Context<AppContext>) =>
  created(await service.calculatePayroll(c.env, actor(c), validatePayrollCalculateInput(await body(c))), "Payroll calculated successfully.", { requestId: c.get("requestId") });

export const recalculate = async (c: Context<AppContext>) =>
  ok(await service.recalculatePayroll(c.env, actor(c), id(c), validatePayrollAction(await body(c))), "Payroll recalculated successfully.", { requestId: c.get("requestId") });

export const previewCalculation = async (c: Context<AppContext>) =>
  ok(await service.previewPayrollCalculation(c.env, actor(c), id(c)), "Payroll calculation preview loaded successfully.", { requestId: c.get("requestId") });

export const listItems = async (c: Context<AppContext>) => {
  const result = await service.listItems(c.env, actor(c), id(c), validateItemFilters(query(c)));
  return paginated(result.rows, result.pagination, "Payroll items loaded successfully.", { requestId: c.get("requestId") });
};

export const getItem = async (c: Context<AppContext>) =>
  ok({ payroll_item: await service.getItem(c.env, actor(c), id(c), id(c, "itemId")) }, "Payroll item loaded successfully.", { requestId: c.get("requestId") });

export const listExceptions = async (c: Context<AppContext>) => {
  const result = await service.listExceptions(c.env, actor(c), id(c), validateExceptionFilters(query(c)));
  return paginated(result.rows, result.pagination, "Payroll exceptions loaded successfully.", { requestId: c.get("requestId") });
};

export const resolveException = async (c: Context<AppContext>) =>
  ok(await service.resolveException(c.env, actor(c), id(c), id(c, "exceptionId"), validateExceptionResolve(await body(c))), "Payroll exception resolved.", { requestId: c.get("requestId") });

export const submitApproval = async (c: Context<AppContext>) =>
  ok(await service.submitApproval(c.env, actor(c), id(c), validatePayrollAction(await body(c))), "Payroll submitted for approval.", { requestId: c.get("requestId") });

export const approve = async (c: Context<AppContext>) =>
  ok(await service.approvePayroll(c.env, actor(c), id(c), validatePayrollAction(await body(c))), "Payroll approved.", { requestId: c.get("requestId") });

export const reject = async (c: Context<AppContext>) =>
  ok(await service.rejectPayroll(c.env, actor(c), id(c), validatePayrollAction(await body(c))), "Payroll rejected.", { requestId: c.get("requestId") });

export const lock = async (c: Context<AppContext>) =>
  ok(await service.lockPayroll(c.env, actor(c), id(c), validatePayrollAction(await body(c))), "Payroll locked successfully.", { requestId: c.get("requestId") });

export const finalize = async (c: Context<AppContext>) =>
  ok(await service.finalizePayroll(c.env, actor(c), id(c), validatePayrollAction(await body(c))), "Payroll finalized successfully.", { requestId: c.get("requestId") });

export const requestReopen = async (c: Context<AppContext>) =>
  ok(await service.requestReopen(c.env, actor(c), id(c), validatePayrollAction(await body(c))), "Payroll reopen requested.", { requestId: c.get("requestId") });

export const approveReopen = async (c: Context<AppContext>) =>
  ok(await service.approveReopen(c.env, actor(c), id(c), validatePayrollAction(await body(c))), "Payroll reopen approved.", { requestId: c.get("requestId") });

export const reopen = async (c: Context<AppContext>) =>
  ok(await service.reopenPayroll(c.env, actor(c), id(c), validatePayrollAction(await body(c))), "Payroll reopened successfully.", { requestId: c.get("requestId") });

export const exportPayroll = async (c: Context<AppContext>) =>
  ok(await service.exportPayroll(c.env, actor(c), id(c), c.req.query("outlet_id")), "Payroll export prepared successfully.", { requestId: c.get("requestId") });

export const listAdjustments = async (c: Context<AppContext>) => {
  const result = await adjustmentService.listPayrollAdjustments(c.env, actor(c), validatePayrollAdjustmentFilters(query(c)));
  return paginated(result.rows, result.pagination, "Payroll adjustment requests loaded successfully.", { requestId: c.get("requestId") });
};

export const createAdjustment = async (c: Context<AppContext>) =>
  created(await adjustmentService.createPayrollAdjustment(c.env, actor(c), validatePayrollAdjustmentInput(await body(c))), "Payroll adjustment request created successfully.", { requestId: c.get("requestId") });

export const getAdjustment = async (c: Context<AppContext>) =>
  ok(await adjustmentService.getPayrollAdjustment(c.env, actor(c), id(c)), "Payroll adjustment request loaded successfully.", { requestId: c.get("requestId") });

export const submitAdjustment = async (c: Context<AppContext>) =>
  ok(await adjustmentService.submitPayrollAdjustmentForApproval(c.env, actor(c), id(c)), "Payroll adjustment submitted for approval.", { requestId: c.get("requestId") });

export const approveAdjustment = async (c: Context<AppContext>) =>
  ok(await adjustmentService.approvePayrollAdjustmentStep(c.env, actor(c), id(c), validatePayrollAdjustmentAction(await body(c))), "Payroll adjustment approval recorded successfully.", { requestId: c.get("requestId") });

export const rejectAdjustment = async (c: Context<AppContext>) =>
  ok(await adjustmentService.rejectPayrollAdjustmentStep(c.env, actor(c), id(c), validatePayrollAdjustmentAction(await body(c))), "Payroll adjustment rejected successfully.", { requestId: c.get("requestId") });

export const cancelAdjustment = async (c: Context<AppContext>) =>
  ok(await adjustmentService.cancelPayrollAdjustment(c.env, actor(c), id(c), validatePayrollAdjustmentAction(await body(c))), "Payroll adjustment cancelled successfully.", { requestId: c.get("requestId") });

export const applyAdjustment = async (c: Context<AppContext>) =>
  ok(await adjustmentService.applyApprovedPayrollAdjustment(c.env, actor(c), id(c), validatePayrollAdjustmentAction(await body(c))), "Payroll adjustment apply action completed.", { requestId: c.get("requestId") });

export const adjustmentTimeline = async (c: Context<AppContext>) =>
  ok(await adjustmentService.getPayrollAdjustmentTimeline(c.env, actor(c), id(c)), "Payroll adjustment approval timeline loaded successfully.", { requestId: c.get("requestId") });
