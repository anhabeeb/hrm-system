import type { Context } from "hono";

import * as service from "./audit-logs.service";
import { validateAuditLogFilters, validateAuditLogId } from "./audit-logs.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const requiredId = (c: Context<AppContext>) => {
  const value = c.req.param("id");
  if (!value) throw new ValidationError("Audit log is required.");
  return validateAuditLogId(value);
};

export const listAuditLogs = async (c: Context<AppContext>) => {
  const result = await service.listAuditLogs(
    c.env,
    actor(c),
    validateAuditLogFilters({
      date_from: c.req.query("date_from"),
      date_to: c.req.query("date_to"),
      actor_user_id: c.req.query("actor_user_id"),
      module: c.req.query("module"),
      action: c.req.query("action"),
      entity_type: c.req.query("entity_type"),
      entity_id: c.req.query("entity_id"),
      request_id: c.req.query("request_id"),
      severity: c.req.query("severity"),
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
    }),
  );

  return paginated(result.rows, result.pagination, "Audit logs loaded successfully.", {
    requestId: c.get("requestId"),
  });
};

export const getAuditLog = async (c: Context<AppContext>) =>
  ok(
    { audit_log: await service.getAuditLog(c.env, actor(c), requiredId(c)) },
    "Audit log loaded successfully.",
    { requestId: c.get("requestId") },
  );
