import type { AuthActor } from "../../types/api.types";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import { resolveModuleFeatureAliases } from "../../config/module-codes";
import { getEnabledApprovalOperationTypes } from "../approvals/approval-module-access.service";
import { APPROVAL_OPERATION_TYPES } from "../approvals/approval-workflow-engine.types";
import type { NavigationBadgesResponse } from "./navigation.types";

const hasAny = (actor: AuthActor, permissions: string[]) =>
  permissionService.isSuperAdmin(actor) || permissionService.hasAnyPermission(actor, permissions);

export const SUPPORTED_NAVIGATION_BADGE_KEYS = [
  "approvals",
  "attendanceCorrections",
  "rosterChanges",
  "documentExpiry",
] as const;

type ActorEmployeeScope = {
  id: string;
  department_id: string | null;
  level: number | null;
  primary_outlet_id: string | null;
} | null;

const featureEnabled = async (env: Env, actor: AuthActor, moduleCode: string) => {
  const checks = await Promise.all(
    resolveModuleFeatureAliases(moduleCode).map((feature) =>
      settingsService.isFeatureEnabled(env, actor.companyId, feature, actor),
    ),
  );
  return checks.some(Boolean);
};

const findActorLinkedEmployee = async (env: Env, actor: AuthActor): Promise<ActorEmployeeScope> => {
  try {
    const row = await env.DB.prepare(
      `SELECT e.id, e.department_id, e.level, e.primary_outlet_id
         FROM users u
         JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
        WHERE u.company_id = ? AND u.id = ? AND u.deleted_at IS NULL
          AND e.deleted_at IS NULL AND e.archived_at IS NULL
        LIMIT 1`,
    ).bind(actor.companyId, actor.actorUserId).first<NonNullable<ActorEmployeeScope>>();
    return row ?? null;
  } catch {
    return null;
  }
};

const employeeScopeClause = (
  actor: AuthActor,
  employee: ActorEmployeeScope,
  alias = "e",
  options: { ownOnly?: boolean; teamAllowed?: boolean; viewAllAllowed?: boolean } = {},
) => {
  if (options.viewAllAllowed || permissionService.isSuperAdmin(actor) || actor.isAdmin) {
    return { sql: "", params: [] as unknown[] };
  }

  if (options.ownOnly) {
    return employee?.id
      ? { sql: ` AND ${alias}.id = ?`, params: [employee.id] as unknown[] }
      : { sql: " AND 1 = 0", params: [] as unknown[] };
  }

  if (options.teamAllowed && employee?.department_id) {
    return {
      sql: ` AND ${alias}.department_id = ? AND COALESCE(${alias}.level, 0) < ?`,
      params: [employee.department_id, Number(employee.level ?? 0)] as unknown[],
    };
  }

  if (actor.outletIds.length > 0) {
    return {
      sql: ` AND ${alias}.primary_outlet_id IN (${actor.outletIds.map(() => "?").join(", ")})`,
      params: actor.outletIds as unknown[],
    };
  }

  return employee?.id
    ? { sql: ` AND ${alias}.id = ?`, params: [employee.id] as unknown[] }
    : { sql: " AND 1 = 0", params: [] as unknown[] };
};

const maybeCount = async (
  env: Env,
  sql: string,
  params: unknown[],
  allowed: boolean,
): Promise<number | undefined> => {
  if (!allowed) return undefined;
  try {
    const row = await env.DB.prepare(sql).bind(...params).first<{ count: number }>();
    const count = Number(row?.count ?? 0);
    return count > 0 ? count : undefined;
  } catch {
    return undefined;
  }
};

const approvalBadgeCount = async (env: Env, actor: AuthActor, employee: ActorEmployeeScope) => {
  if (!await featureEnabled(env, actor, "approvals")) return undefined;
  if (!hasAny(actor, ["approvals.view", "approvals.requests.view", "department.approvals.view", "approvals.department.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"])) {
    return undefined;
  }
  const enabledOperationTypes = await getEnabledApprovalOperationTypes(env, actor, APPROVAL_OPERATION_TYPES);
  if (enabledOperationTypes.length === 0) return undefined;

  const permissionPlaceholders = actor.permissions.length ? actor.permissions.map(() => "?").join(", ") : "NULL";
  const operationPlaceholders = enabledOperationTypes.map(() => "?").join(", ");
  const viewAllAllowed = hasAny(actor, ["approvals.view", "approvals.requests.view"]);
  const outletScope = employeeScopeClause(actor, employee, "e", {
    viewAllAllowed,
    teamAllowed: hasAny(actor, ["approvals.department.view", "approvals.department.approve", "department.approvals.view"]),
  });
  const departmentEligibility = employee?.department_id
    ? ` OR (
        s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE')
        AND r.department_id = ?
        AND (s.assigned_approver_user_id IS NULL OR s.assigned_approver_user_id = ?)
        AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
        AND (s.required_max_level IS NULL OR ? <= s.required_max_level)
      )`
    : "";
  const departmentParams = employee?.department_id
    ? [employee.department_id, actor.actorUserId, employee.level ?? 0, employee.level ?? 99]
    : [];

  return maybeCount(
    env,
    `SELECT COUNT(DISTINCT r.id) AS count
       FROM approval_requests r
       JOIN approval_request_steps s ON s.company_id = r.company_id AND s.approval_request_id = r.id
       LEFT JOIN employees e ON e.company_id = r.company_id AND e.id = COALESCE(r.subject_employee_id, r.employee_id, r.requester_employee_id)
      WHERE r.company_id = ?
        AND r.operation_type IN (${operationPlaceholders})
        AND r.status IN ('PENDING', 'IN_REVIEW', 'SUBMITTED', 'pending', 'in_progress', 'submitted')
        AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER', 'pending')
        AND (
          ? = 1
          OR s.assigned_approver_user_id = ?
          OR s.required_permission IN (${permissionPlaceholders})
          OR r.requester_user_id = ?
          ${departmentEligibility}
        )${outletScope.sql}`,
    [
      actor.companyId,
      ...enabledOperationTypes,
      viewAllAllowed ? 1 : 0,
      actor.actorUserId,
      ...actor.permissions,
      actor.actorUserId,
      ...departmentParams,
      ...outletScope.params,
    ],
    true,
  );
};

const attendanceCorrectionsBadgeCount = async (env: Env, actor: AuthActor, employee: ActorEmployeeScope) => {
  if (!await featureEnabled(env, actor, "attendance")) return undefined;
  const viewAllAllowed = hasAny(actor, ["attendance.view", "attendance.corrections.view", "attendance.calendar.viewAll", "attendance.reports.view"]);
  const teamAllowed = hasAny(actor, ["attendance.calendar.viewTeam", "attendance.teamCalendar.view", "approvals.department.view", "approvals.department.approve"]);
  const ownAllowed = hasAny(actor, ["self.attendance.view", "self.attendance.calendar.view"]);
  if (!viewAllAllowed && !teamAllowed && !ownAllowed) return undefined;
  const scope = employeeScopeClause(actor, employee, "e", { viewAllAllowed, teamAllowed, ownOnly: !viewAllAllowed && !teamAllowed && ownAllowed });

  return maybeCount(
    env,
    `SELECT COUNT(*) AS count
       FROM attendance_corrections c
       JOIN employees e ON e.company_id = c.company_id AND e.id = c.employee_id
      WHERE c.company_id = ?
        AND c.status IN ('pending', 'submitted', 'pending_approval', 'PENDING', 'PENDING_DEPARTMENT_APPROVAL', 'PENDING_HR_APPROVAL', 'PENDING_MANUAL_REVIEW')${scope.sql}`,
    [actor.companyId, ...scope.params],
    true,
  );
};

const rosterChangesBadgeCount = async (env: Env, actor: AuthActor, employee: ActorEmployeeScope) => {
  if (!await featureEnabled(env, actor, "roster")) return undefined;
  const viewAllAllowed = hasAny(actor, ["rosters.view", "roster.view", "roster.changes.view", "rosters.weeklyMatrix.viewAll", "rosters.manage"]);
  const teamAllowed = hasAny(actor, ["rosters.weeklyMatrix.viewTeam", "rosters.weeklyMatrix.view", "attendance.teamCalendar.view"]);
  const ownAllowed = hasAny(actor, ["self.roster.view"]);
  if (!viewAllAllowed && !teamAllowed && !ownAllowed) return undefined;
  const scope = employeeScopeClause(actor, employee, "e", { viewAllAllowed, teamAllowed, ownOnly: !viewAllAllowed && !teamAllowed && ownAllowed });

  return maybeCount(
    env,
    `SELECT COUNT(*) AS count
       FROM roster_change_requests r
       LEFT JOIN employees e ON e.company_id = r.company_id AND e.id = COALESCE(r.employee_id, r.requester_employee_id)
      WHERE r.company_id = ?
        AND r.status IN ('PENDING', 'PENDING_DEPARTMENT_APPROVAL', 'PENDING_HR_APPROVAL', 'PENDING_MANUAL_REVIEW')
        ${scope.sql}`,
    [actor.companyId, ...scope.params],
    true,
  );
};

const documentExpiryBadgeCount = async (env: Env, actor: AuthActor, employee: ActorEmployeeScope) => {
  if (!await featureEnabled(env, actor, "documents_kyc")) return undefined;
  const viewAllAllowed = hasAny(actor, ["expiry_alerts.view", "documents.view", "documents.expiry.view"]);
  const ownAllowed = hasAny(actor, ["expiry_alerts.view_own", "self.documents.view"]);
  if (!viewAllAllowed && !ownAllowed) return undefined;
  const scope = employeeScopeClause(actor, employee, "e", { viewAllAllowed, ownOnly: !viewAllAllowed && ownAllowed });

  return maybeCount(
    env,
    `SELECT COUNT(*) AS count
       FROM expiry_alerts a
       LEFT JOIN employees e ON e.company_id = a.company_id AND e.id = a.employee_id
      WHERE a.company_id = ?
        AND a.status IN ('open', 'pending', 'critical', 'OPEN', 'PENDING', 'CRITICAL')
        ${scope.sql}`,
    [actor.companyId, ...scope.params],
    true,
  );
};

export const getNavigationBadges = async (env: Env, actor: AuthActor): Promise<NavigationBadgesResponse> => {
  const employee = await findActorLinkedEmployee(env, actor);
  const [approvals, attendanceCorrections, rosterChanges, documentExpiry] = await Promise.all([
    approvalBadgeCount(env, actor, employee),
    attendanceCorrectionsBadgeCount(env, actor, employee),
    rosterChangesBadgeCount(env, actor, employee),
    documentExpiryBadgeCount(env, actor, employee),
  ]);

  return {
    badges: {
      ...(approvals ? { approvals } : {}),
      ...(attendanceCorrections ? { attendanceCorrections } : {}),
      ...(rosterChanges ? { rosterChanges } : {}),
      ...(documentExpiry ? { documentExpiry } : {}),
    },
    generated_at: new Date().toISOString(),
  };
};
