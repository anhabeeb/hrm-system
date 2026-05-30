import type { Context } from "hono";

import * as service from "./profile-update-requests.service";
import {
  validateProfileUpdateRequestFilters,
  validateReviewInput,
} from "./profile-update-requests.validators";
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
  if (!value) throw new ValidationError("Profile update request is required.");
  return value;
};

export const listRequests = async (c: Context<AppContext>) => {
  const result = await service.listRequests(
    c.env,
    actor(c),
    validateProfileUpdateRequestFilters({
      status: c.req.query("status"),
      request_type: c.req.query("request_type"),
      user_id: c.req.query("user_id"),
      employee_id: c.req.query("employee_id"),
      date_from: c.req.query("date_from"),
      date_to: c.req.query("date_to"),
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
      sort_by: c.req.query("sort_by"),
      sort_direction: c.req.query("sort_direction"),
    }),
  );
  return paginated(
    result.rows,
    result.pagination,
    "Profile update requests loaded successfully.",
    { requestId: c.get("requestId") },
  );
};

export const getRequest = async (c: Context<AppContext>) =>
  ok(
    { request: await service.getRequest(c.env, actor(c), id(c)) },
    "Profile update request loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const approveRequest = async (c: Context<AppContext>) =>
  {
    const result = await service.approveRequest(
      c.env,
      actor(c),
      id(c),
      validateReviewInput(await body(c)),
    );

    return ok(
      result,
      result.manual_follow_up_required
        ? "Profile update request approved. Manual HR follow-up may be required for this update type."
        : "Profile update request approved successfully.",
      { requestId: c.get("requestId") },
    );
  };

export const rejectRequest = async (c: Context<AppContext>) =>
  ok(
    await service.rejectRequest(
      c.env,
      actor(c),
      id(c),
      validateReviewInput(await body(c)),
    ),
    "Profile update request rejected.",
    { requestId: c.get("requestId") },
  );

export const returnForMoreInfo = async (c: Context<AppContext>) =>
  ok(
    await service.returnForMoreInfo(
      c.env,
      actor(c),
      id(c),
      validateReviewInput(await body(c)),
    ),
    "Profile update request returned for more information.",
    { requestId: c.get("requestId") },
  );
