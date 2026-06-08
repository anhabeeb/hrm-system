import type { Context } from "hono";

import * as service from "./leave.service";
import {
  validateBalanceAdjust,
  validateBalanceFilters,
  validateCalendarFilters,
  validateAccrualInput,
  validateCarryForwardInput,
  validateExpiryInput,
  validateLeaveAction,
  validateLeaveDelegate,
  validateLeaveRequestCreate,
  validateLeaveRequestUpdate,
  validateLeaveTypeFilters,
  validateLeaveTypeUpdate,
  validateOpeningBalance,
  validatePolicyCreate,
  validatePolicyFilters,
  validatePolicyUpdate,
  validateRequestFilters,
  validateTransactionFilters,
} from "./leave.validators";
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
  if (!value) throw new ValidationError("The requested record is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  is_enabled: c.req.query("is_enabled"),
  is_statutory: c.req.query("is_statutory"),
  is_paid: c.req.query("is_paid"),
  search: c.req.query("search"),
  employee_type: c.req.query("employee_type"),
  leave_type_id: c.req.query("leave_type_id"),
  status: c.req.query("status"),
  effective_from: c.req.query("effective_from"),
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  department_id: c.req.query("department_id"),
  year: c.req.query("year"),
  date_from: c.req.query("date_from"),
  date_to: c.req.query("date_to"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
  sort_by: c.req.query("sort_by"),
  sort_direction: c.req.query("sort_direction"),
});

export const listTypes = async (c: Context<AppContext>) => {
  const result = await service.listLeaveTypes(c.env, actor(c), validateLeaveTypeFilters(query(c)));
  return paginated(result.rows, result.pagination, "Leave types loaded successfully.", { requestId: c.get("requestId") });
};

export const updateType = async (c: Context<AppContext>) =>
  ok(await service.updateLeaveType(c.env, actor(c), id(c), validateLeaveTypeUpdate(await body(c))), "Leave type updated successfully.", { requestId: c.get("requestId") });

export const listPolicies = async (c: Context<AppContext>) => {
  const result = await service.listPolicies(c.env, actor(c), validatePolicyFilters(query(c)));
  return paginated(result.rows, result.pagination, "Leave policies loaded successfully.", { requestId: c.get("requestId") });
};

export const createPolicy = async (c: Context<AppContext>) =>
  created(await service.createPolicy(c.env, actor(c), validatePolicyCreate(await body(c))), "Leave policy created successfully.", { requestId: c.get("requestId") });

export const updatePolicy = async (c: Context<AppContext>) =>
  ok(await service.updatePolicy(c.env, actor(c), id(c), validatePolicyUpdate(await body(c))), "Leave policy updated successfully.", { requestId: c.get("requestId") });

export const listBalances = async (c: Context<AppContext>) => {
  const result = await service.listBalances(c.env, actor(c), validateBalanceFilters(query(c)));
  return paginated(result.rows, result.pagination, "Leave balances loaded successfully.", { requestId: c.get("requestId") });
};

export const getEmployeeBalances = async (c: Context<AppContext>) =>
  ok({ balances: await service.getEmployeeBalances(c.env, actor(c), id(c, "employeeId")) }, "Leave balances loaded successfully.", { requestId: c.get("requestId") });

export const adjustBalance = async (c: Context<AppContext>) =>
  ok(await service.adjustBalance(c.env, actor(c), id(c, "employeeId"), validateBalanceAdjust(await body(c))), "Leave balance updated successfully.", { requestId: c.get("requestId") });

export const adjustBalanceFromBody = async (c: Context<AppContext>) => {
  const payload = await body(c);
  const employeeId = typeof payload.employee_id === "string" && payload.employee_id.trim() ? payload.employee_id.trim() : "";
  if (!employeeId) throw new ValidationError("Employee is required.");
  return ok(await service.adjustBalance(c.env, actor(c), employeeId, validateBalanceAdjust(payload)), "Leave balance updated successfully.", { requestId: c.get("requestId") });
};

export const setOpeningBalance = async (c: Context<AppContext>) =>
  ok(await service.setOpeningBalance(c.env, actor(c), validateOpeningBalance(await body(c))), "Opening balance saved successfully.", { requestId: c.get("requestId") });

export const listBalanceTransactions = async (c: Context<AppContext>) => {
  const employeeId = id(c, "employeeId");
  const result = await service.listBalanceTransactions(c.env, actor(c), validateTransactionFilters(query(c), employeeId));
  return paginated(result.rows, result.pagination, "Leave balance transactions loaded successfully.", { requestId: c.get("requestId") });
};

export const previewAccrual = async (c: Context<AppContext>) =>
  ok(await service.previewAccrual(c.env, actor(c), validateAccrualInput(await body(c))), "Leave accrual preview generated successfully.", { requestId: c.get("requestId") });

export const applyAccrual = async (c: Context<AppContext>) =>
  ok(await service.applyAccrual(c.env, actor(c), validateAccrualInput(await body(c))), "Leave accrual applied successfully.", { requestId: c.get("requestId") });

export const applyCarryForward = async (c: Context<AppContext>) =>
  ok(await service.applyCarryForward(c.env, actor(c), validateCarryForwardInput(await body(c))), "Leave carry-forward applied successfully.", { requestId: c.get("requestId") });

export const applyExpiry = async (c: Context<AppContext>) =>
  ok(await service.applyExpiry(c.env, actor(c), validateExpiryInput(await body(c))), "Leave expiry applied successfully.", { requestId: c.get("requestId") });

export const rebuildBalances = async (c: Context<AppContext>) =>
  ok(await service.rebuildEmployeeLeaveBalances(c.env, actor(c), id(c, "employeeId"), Number(c.req.query("year") ?? new Date().getFullYear())), "Leave balance rebuild completed successfully.", { requestId: c.get("requestId") });

export const listRequests = async (c: Context<AppContext>) => {
  const result = await service.listRequests(c.env, actor(c), validateRequestFilters(query(c)));
  return paginated(result.rows, result.pagination, "Leave requests loaded successfully.", { requestId: c.get("requestId") });
};

export const listApprovalInbox = async (c: Context<AppContext>) => {
  const result = await service.listApprovalInbox(c.env, actor(c), validateRequestFilters(query(c)));
  return paginated(result.rows, result.pagination, "Leave approval inbox loaded successfully.", { requestId: c.get("requestId") });
};

export const listApprovalHistory = async (c: Context<AppContext>) => {
  const result = await service.listApprovalHistory(c.env, actor(c), validateRequestFilters(query(c)));
  return paginated(result.rows, result.pagination, "Leave approval history loaded successfully.", { requestId: c.get("requestId") });
};

export const getApprovalDetail = async (c: Context<AppContext>) =>
  ok(await service.getApprovalDetail(c.env, actor(c), id(c, "requestId")), "Leave approval detail loaded successfully.", { requestId: c.get("requestId") });

export const getTimeline = async (c: Context<AppContext>) =>
  ok(await service.getApprovalDetail(c.env, actor(c), id(c, "requestId")), "Leave request timeline loaded successfully.", { requestId: c.get("requestId") });

export const getRequest = async (c: Context<AppContext>) =>
  ok({ leave_request: await service.getRequest(c.env, actor(c), id(c)) }, "Leave request loaded successfully.", { requestId: c.get("requestId") });

export const createRequest = async (c: Context<AppContext>) =>
  {
    const result = await service.createRequest(c.env, actor(c), validateLeaveRequestCreate(await body(c)));
    return created(
      result,
      result.long_leave_required
        ? "Leave request created successfully. Long leave salary impact review is required."
        : "Leave request created successfully.",
      { requestId: c.get("requestId") },
    );
  };

export const updateRequest = async (c: Context<AppContext>) =>
  {
    const result = await service.updateRequest(c.env, actor(c), id(c), validateLeaveRequestUpdate(await body(c)));
    return ok(
      result,
      result.long_leave_required
        ? "Leave request updated successfully. Long leave salary impact review is required."
        : "Leave request updated successfully.",
      { requestId: c.get("requestId") },
    );
  };

export const submitRequest = async (c: Context<AppContext>) =>
  ok(await service.submitRequest(c.env, actor(c), id(c), validateLeaveAction(await body(c))), "Leave request submitted.", { requestId: c.get("requestId") });

export const approveRequest = async (c: Context<AppContext>) =>
  {
    const result = await service.approveRequest(c.env, actor(c), id(c), validateLeaveAction(await body(c)));
    return ok(
      result,
      result.long_leave_required
        ? "Leave request approved. Long leave salary impact review is required."
        : "Leave request approved.",
      { requestId: c.get("requestId") },
    );
  };

export const rejectRequest = async (c: Context<AppContext>) =>
  ok(await service.rejectRequest(c.env, actor(c), id(c), validateLeaveAction(await body(c))), "Leave request rejected.", { requestId: c.get("requestId") });

export const cancelRequest = async (c: Context<AppContext>) =>
  ok(await service.cancelRequest(c.env, actor(c), id(c), validateLeaveAction(await body(c))), "Leave request cancelled.", { requestId: c.get("requestId") });

export const withdrawRequest = async (c: Context<AppContext>) =>
  ok(await service.withdrawRequest(c.env, actor(c), id(c), validateLeaveAction(await body(c))), "Leave request withdrawn.", { requestId: c.get("requestId") });

export const delegateRequest = async (c: Context<AppContext>) =>
  ok(await service.delegateRequest(c.env, actor(c), id(c), validateLeaveDelegate(await body(c))), "Leave approval delegated.", { requestId: c.get("requestId") });

export const escalateRequest = async (c: Context<AppContext>) =>
  ok(await service.escalateRequest(c.env, actor(c), id(c), validateLeaveAction(await body(c))), "Leave approval escalated.", { requestId: c.get("requestId") });

export const calendar = async (c: Context<AppContext>) =>
  ok({ calendar: await service.calendar(c.env, actor(c), validateCalendarFilters(query(c))) }, "Leave calendar loaded successfully.", { requestId: c.get("requestId") });
