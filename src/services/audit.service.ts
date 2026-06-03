export interface AuditLogInput {
  companyId?: string;
  outletId?: string;
  module?: string;
  action: string;
  severity?: string;
  entityType: string;
  actorId?: string;
  entityId?: string;
  employeeId?: string;
  actorRoleId?: string;
  deviceId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  oldValueJson?: string;
  newValueJson?: string;
  reason?: string;
  effectiveDate?: string;
  approvalRequestId?: string;
  syncBatchId?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export const createAuditLog = async (env: Env, input: AuditLogInput) => {
  if (!input.companyId) {
    console.info("Audit log skipped because company is not available", input);

    return {
      created: false,
      message: "Audit logging skipped because company context was not available.",
    };
  }

  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (
        id, company_id, outlet_id, module, action, severity, entity_type,
        entity_id, employee_id, actor_user_id, actor_role_id, device_id,
        ip_address, user_agent, old_value_json, new_value_json, reason,
        effective_date, approval_request_id, sync_batch_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        input.companyId,
        input.outletId ?? null,
        input.module ?? "system",
        input.action,
        input.severity ?? "info",
        input.entityType,
        input.entityId ?? null,
        input.employeeId ?? null,
        input.actorId ?? null,
        input.actorRoleId ?? null,
        input.deviceId ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.oldValueJson ?? null,
        input.newValueJson ?? (input.details ? JSON.stringify(input.details) : null),
        input.reason ?? null,
        input.effectiveDate ?? null,
        input.approvalRequestId ?? null,
        input.syncBatchId ?? null,
        new Date().toISOString(),
      )
      .run();

    return {
      created: true,
      message: "Audit log recorded.",
    };
  } catch (error) {
    console.error("Audit log could not be recorded", {
      action: input.action,
      requestId: input.requestId,
      error,
    });

    return {
      created: false,
      message: "Audit logging was skipped because it could not be recorded.",
    };
  }
};
