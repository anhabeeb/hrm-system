import * as repository from "./expiry-alerts.repository";
import type {
  ExpiryActionInput,
  ExpiryAlertCandidate,
  ExpiryAlertListFilters,
  ExpiryAlertRecord,
  ExpiryAlertSettings,
  ExpiryAlertSettingsRecord,
  ExpiryScanFilters,
  ExpirySettingsInput,
  ExpirySourceRow,
} from "./expiry-alerts.types";
import { safeNotifyResolvedRecipients } from "../notifications/notifications.service";
import { sanitizeNotificationMetadata } from "../notifications/notification-safety";
import {
  applyEnabledExpirySourceToggles,
  getEnabledExpirySourceTypes,
  isExpirySourceTypeEnabled,
} from "../notifications/module-aware-alerts";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, PermissionError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const msPerDay = 86_400_000;
const activeStatuses = new Set(["open", "acknowledged", "snoozed"]);
const severityRank: Record<string, number> = { info: 0, warning: 1, high: 2, critical: 3 };

export const defaultExpiryAlertSettings: ExpiryAlertSettings = {
  enabled: true,
  warning_days: [90, 60, 30, 14, 7, 1],
  overdue_enabled: true,
  repeat_frequency: "weekly",
  quiet_days: 7,
  in_app_enabled: true,
  email_enabled: true,
  minimum_email_severity: "high",
  notify_roles: ["hr_admin", "admin", "super_admin"],
  notify_permissions: ["expiry_alerts.manage", "expiry_alerts.view"],
  notify_employee_self: false,
  fallback_to_admins: true,
  include_archived_employees: false,
  include_inactive_employees: false,
  source_toggles: {
    employee_documents: true,
    employee_passport: true,
    employee_work_permit: true,
    contracts: true,
    probation: true,
    long_leave_return: true,
    assets: false,
    uniforms: false,
  },
};

const safeJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const normalizeSettings = (record?: ExpiryAlertSettingsRecord | null): ExpiryAlertSettings => {
  if (!record) return defaultExpiryAlertSettings;
  return {
    enabled: record.enabled === 1,
    warning_days: safeJson<number[]>(record.warning_days_json, defaultExpiryAlertSettings.warning_days)
      .map((days) => Number(days))
      .filter((days) => Number.isInteger(days) && days >= 0)
      .sort((a, b) => b - a),
    overdue_enabled: record.overdue_enabled === 1,
    repeat_frequency: ["daily", "weekly", "monthly", "none"].includes(record.repeat_frequency)
      ? record.repeat_frequency as ExpiryAlertSettings["repeat_frequency"]
      : defaultExpiryAlertSettings.repeat_frequency,
    quiet_days: Math.max(0, Math.min(60, Number(record.quiet_days ?? defaultExpiryAlertSettings.quiet_days))),
    in_app_enabled: record.in_app_enabled === 1,
    email_enabled: record.email_enabled === 1,
    minimum_email_severity: ["info", "warning", "high", "critical"].includes(record.minimum_email_severity)
      ? record.minimum_email_severity as ExpiryAlertSettings["minimum_email_severity"]
      : "high",
    notify_roles: safeJson<string[]>(record.notify_roles_json, defaultExpiryAlertSettings.notify_roles).filter(Boolean),
    notify_permissions: safeJson<string[]>(record.notify_permissions_json, defaultExpiryAlertSettings.notify_permissions).filter(Boolean),
    notify_employee_self: record.notify_employee_self === 1,
    fallback_to_admins: record.fallback_to_admins === 1,
    include_archived_employees: record.include_archived_employees === 1,
    include_inactive_employees: record.include_inactive_employees === 1,
    source_toggles: {
      ...defaultExpiryAlertSettings.source_toggles,
      ...safeJson<Record<string, boolean>>(record.source_toggles_json, {}),
    },
    updated_by: record.updated_by,
    updated_reason: record.updated_reason,
  };
};

const dateOnly = (value: string) => value.slice(0, 10);
const isPastSnooze = (snoozedUntil: string | null | undefined, now: string) => {
  if (!snoozedUntil) return false;
  const parsed = Date.parse(snoozedUntil.length === 10 ? `${snoozedUntil}T00:00:00.000Z` : snoozedUntil);
  return Number.isFinite(parsed) && parsed <= Date.parse(now);
};
const isFutureSnooze = (snoozedUntil: string | null | undefined, now: string) => {
  if (!snoozedUntil) return false;
  const parsed = Date.parse(snoozedUntil.length === 10 ? `${snoozedUntil}T00:00:00.000Z` : snoozedUntil);
  return Number.isFinite(parsed) && parsed > Date.parse(now);
};
const addDays = (date: string, days: number) => {
  const next = new Date(`${dateOnly(date)}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

const addMonths = (isoDate: string, months: number) => {
  const next = new Date(isoDate);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next.toISOString();
};

export const daysBetween = (fromDate: string, toDate: string) => {
  const from = Date.parse(`${dateOnly(fromDate)}T00:00:00.000Z`);
  const to = Date.parse(`${dateOnly(toDate)}T00:00:00.000Z`);
  return Math.round((to - from) / msPerDay);
};

export const classifyExpirySeverity = (daysUntilExpiry: number, warningDays: number[]) => {
  if (daysUntilExpiry < 0) return { alert_type: "overdue" as const, severity: "critical" as const };
  if (daysUntilExpiry === 0) return { alert_type: "due_today" as const, severity: "critical" as const };
  const sorted = [...warningDays].sort((a, b) => a - b);
  const smallest = sorted[0] ?? 1;
  if (daysUntilExpiry <= Math.max(7, smallest)) return { alert_type: "upcoming_expiry" as const, severity: "high" as const };
  if (daysUntilExpiry <= 30) return { alert_type: "upcoming_expiry" as const, severity: "warning" as const };
  return { alert_type: "upcoming_expiry" as const, severity: "info" as const };
};

const sourceTitle = (sourceType: string) => {
  switch (sourceType) {
    case "employee_document": return "Employee document";
    case "employee_passport": return "Passport";
    case "employee_work_permit": return "Work permit";
    case "contract": return "Employee contract";
    case "probation": return "Probation";
    case "long_leave_return": return "Long leave return";
    default: return "Expiry item";
  }
};

const sourceActionUrl = (sourceType: string, row: ExpirySourceRow) => {
  if (sourceType === "employee_document") return `/documents?employee_id=${encodeURIComponent(row.employee_id ?? "")}`;
  if (sourceType === "contract") return `/contracts?employee_id=${encodeURIComponent(row.employee_id ?? "")}`;
  if (sourceType === "probation") return `/contracts?employee_id=${encodeURIComponent(row.employee_id ?? "")}`;
  if (sourceType === "long_leave_return") return `/long-leave`;
  return row.employee_id ? `/employees?employee_id=${encodeURIComponent(row.employee_id)}` : null;
};

const parseSourceMetadata = (row: any) => {
  const raw = row.metadata_json ?? row.metadata;
  if (!raw) return {};
  if (typeof raw === "object") return sanitizeNotificationMetadata(raw) ?? {};
  try {
    return sanitizeNotificationMetadata(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
};

const sourceRowsFromIdentity = (rows: any[], toggles: Record<string, boolean>): ExpirySourceRow[] => {
  const output: ExpirySourceRow[] = [];
  for (const row of rows) {
    if (toggles.employee_passport && row.passport_expiry_date) {
      output.push({
        source_type: "employee_passport",
        source_table: "employees",
        source_id: row.employee_id,
        source_label: "Passport",
        expiry_date: row.passport_expiry_date,
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        employee_name: row.employee_name,
        employee_type: row.employee_type,
        employment_status: row.employment_status,
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name,
        department_id: row.department_id,
        department_name: row.department_name,
      });
    }
    if (toggles.employee_work_permit && row.work_permit_expiry_date) {
      output.push({
        source_type: "employee_work_permit",
        source_table: "employees",
        source_id: row.employee_id,
        source_label: "Work permit",
        expiry_date: row.work_permit_expiry_date,
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        employee_name: row.employee_name,
        employee_type: row.employee_type,
        employment_status: row.employment_status,
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name,
        department_id: row.department_id,
        department_name: row.department_name,
      });
    }
  }
  return output;
};

const sourceRowsFromContracts = (rows: any[], toggles: Record<string, boolean>): ExpirySourceRow[] => {
  const output: ExpirySourceRow[] = [];
  for (const row of rows) {
    if (toggles.contracts && row.end_date) {
      output.push({
        source_type: "contract",
        source_table: "employee_contracts",
        source_id: row.contract_id,
        source_label: row.contract_number ? `Contract ${row.contract_number}` : "Employee contract",
        expiry_date: row.end_date,
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        employee_name: row.employee_name,
        employee_type: row.employee_type,
        employment_status: row.employment_status,
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name,
        department_id: row.department_id,
        department_name: row.department_name,
        metadata: { contract_type: row.contract_type },
      });
    }
    if (toggles.probation && row.probation_end_date) {
      output.push({
        source_type: "probation",
        source_table: "employee_contracts",
        source_id: `${row.contract_id}:probation`,
        source_label: "Probation end",
        expiry_date: row.probation_end_date,
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        employee_name: row.employee_name,
        employee_type: row.employee_type,
        employment_status: row.employment_status,
        outlet_id: row.outlet_id,
        outlet_name: row.outlet_name,
        department_id: row.department_id,
        department_name: row.department_name,
        metadata: { contract_id: row.contract_id, contract_type: row.contract_type },
      });
    }
  }
  return output;
};

export const buildExpiryAlertCandidate = (
  companyId: string,
  row: ExpirySourceRow,
  asOfDate: string,
  warningDays: number[],
): ExpiryAlertCandidate | null => {
  if (!row.expiry_date) return null;
  const days = daysBetween(asOfDate, row.expiry_date);
  const maxWarning = Math.max(...warningDays, 0);
  if (days > maxWarning) return null;
  const { alert_type, severity } = classifyExpirySeverity(days, warningDays);
  const label = sourceTitle(row.source_type);
  const employeeLabel = row.employee_name ? ` for ${row.employee_name}` : "";
  const when = days < 0 ? `${Math.abs(days)} day(s) overdue` : days === 0 ? "due today" : `due in ${days} day(s)`;
  const title = `${label} ${alert_type === "overdue" ? "expired" : "expiring"}${employeeLabel}`;
  const message = `${row.source_label} is ${when} (${dateOnly(row.expiry_date)}). Please review and update the record if needed.`;
  const metadata = sanitizeNotificationMetadata({
    source_type: row.source_type,
    source_table: row.source_table,
    source_id: row.source_id,
    source_label: row.source_label,
    employee_code: row.employee_code,
    employee_name: row.employee_name,
    employee_type: row.employee_type,
    outlet_name: row.outlet_name,
    department_name: row.department_name,
    ...parseSourceMetadata(row),
  }) ?? {};
  return {
    ...row,
    company_id: companyId,
    days_until_expiry: days,
    alert_type,
    severity,
    title,
    message,
    action_url: sourceActionUrl(row.source_type, row),
    idempotency_key: `expiry:${companyId}:${row.source_type}:${row.source_id}:${dateOnly(row.expiry_date)}`,
    metadata,
  };
};

export const getSettings = async (env: Env, context: AuthActor) => {
  const settings = normalizeSettings(await repository.getSettings(env, context.companyId));
  return {
    settings: {
      ...settings,
      source_toggles: applyEnabledExpirySourceToggles(
        settings.source_toggles,
        await getEnabledExpirySourceTypes(env, context.companyId, context),
      ),
    },
  };
};

export const updateSettings = async (env: Env, context: AuthActor, input: ExpirySettingsInput) => {
  if (!permissionService.hasAnyPermission(context, ["expiry_alerts.settings.manage"])) {
    throw new PermissionError("You do not have permission to manage expiry alert settings.", "EXPIRY_ALERT_PERMISSION_DENIED");
  }
  const current = normalizeSettings(await repository.getSettings(env, context.companyId));
  const next: ExpiryAlertSettings = {
    ...current,
    ...input,
    source_toggles: { ...current.source_toggles, ...(input.source_toggles ?? {}) },
    warning_days: (input.warning_days ?? current.warning_days).map(Number).filter((days) => Number.isInteger(days) && days >= 0).sort((a, b) => b - a),
    notify_roles: (input.notify_roles ?? current.notify_roles).filter(Boolean),
    notify_permissions: (input.notify_permissions ?? current.notify_permissions).filter(Boolean),
  };
  if (!input.reason?.trim()) {
    throw new AppError("A reason is required to update expiry alert settings.", "EXPIRY_ALERT_REASON_REQUIRED", 400);
  }
  const timestamp = new Date().toISOString();
  await repository.upsertSettings(env, {
    id: createPrefixedId("expiry_settings"),
    companyId: context.companyId,
    enabled: next.enabled ? 1 : 0,
    warningDaysJson: JSON.stringify(next.warning_days),
    overdueEnabled: next.overdue_enabled ? 1 : 0,
    repeatFrequency: next.repeat_frequency,
    quietDays: next.quiet_days,
    inAppEnabled: next.in_app_enabled ? 1 : 0,
    emailEnabled: next.email_enabled ? 1 : 0,
    minimumEmailSeverity: next.minimum_email_severity,
    notifyRolesJson: JSON.stringify(next.notify_roles),
    notifyPermissionsJson: JSON.stringify(next.notify_permissions),
    notifyEmployeeSelf: next.notify_employee_self ? 1 : 0,
    fallbackToAdmins: next.fallback_to_admins ? 1 : 0,
    includeArchivedEmployees: next.include_archived_employees ? 1 : 0,
    includeInactiveEmployees: next.include_inactive_employees ? 1 : 0,
    sourceTogglesJson: JSON.stringify(next.source_toggles),
    updatedBy: context.actorUserId,
    reason: input.reason.trim(),
    timestamp,
  });
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "expiry_alerts",
    action: "expiry_alert_settings_updated",
    entityType: "expiry_alert_settings",
    entityId: context.companyId,
    actorId: context.actorUserId,
    reason: input.reason.trim(),
    details: { warning_days: next.warning_days, source_toggles: next.source_toggles },
    requestId: context.requestId,
  });
  return getSettings(env, context);
};

export const collectExpiryCandidates = async (
  env: Env,
  context: AuthActor,
  scan: ExpiryScanFilters,
): Promise<{ candidates: ExpiryAlertCandidate[]; settings: ExpiryAlertSettings; generated_at: string }> => {
  const settings = normalizeSettings(await repository.getSettings(env, context.companyId));
  const warningDays = (scan.warning_days?.length ? scan.warning_days : settings.warning_days).sort((a, b) => b - a);
  const throughDate = scan.through_date ?? addDays(scan.as_of_date, Math.max(...warningDays, 0));
  if (!settings.enabled) return { candidates: [], settings, generated_at: new Date().toISOString() };

  const includeArchived = scan.include_archived_employees ?? settings.include_archived_employees;
  const includeInactive = scan.include_inactive_employees ?? settings.include_inactive_employees;
  const filters = { employee_id: scan.employee_id, outlet_id: scan.outlet_id, department_id: scan.department_id };
  const sourceRows: ExpirySourceRow[] = [];
  const sourceType = scan.source_type;
  const enabledSourceTypes = await getEnabledExpirySourceTypes(env, context.companyId, context);
  const sourceToggles = applyEnabledExpirySourceToggles(settings.source_toggles, enabledSourceTypes);
  if (sourceType && !enabledSourceTypes.has(sourceType)) {
    return { candidates: [], settings: { ...settings, source_toggles: sourceToggles }, generated_at: new Date().toISOString() };
  }

  if ((!sourceType || ["employee_passport", "employee_work_permit"].includes(sourceType)) && (sourceToggles.employee_passport || sourceToggles.employee_work_permit)) {
    const rows = await repository.listEmployeeIdentitySources(env, context.companyId, throughDate, filters, context.outletIds, context.isSuperAdmin, includeArchived, includeInactive);
    sourceRows.push(...sourceRowsFromIdentity(rows, sourceToggles));
  }
  if ((!sourceType || sourceType === "employee_document") && sourceToggles.employee_documents) {
    sourceRows.push(...await repository.listDocumentSources(env, context.companyId, throughDate, filters, context.outletIds, context.isSuperAdmin, includeArchived, includeInactive));
  }
  if ((!sourceType || ["contract", "probation"].includes(sourceType)) && (sourceToggles.contracts || sourceToggles.probation)) {
    sourceRows.push(...sourceRowsFromContracts(
      await repository.listContractSources(env, context.companyId, throughDate, Boolean(sourceToggles.probation), filters, context.outletIds, context.isSuperAdmin, includeArchived, includeInactive),
      sourceToggles,
    ));
  }
  if ((!sourceType || sourceType === "long_leave_return") && sourceToggles.long_leave_return) {
    sourceRows.push(...await repository.listLongLeaveReturnSources(env, context.companyId, throughDate, filters, context.outletIds, context.isSuperAdmin, includeArchived, includeInactive));
  }

  const candidates = sourceRows
    .filter((row) => !sourceType || row.source_type === sourceType)
    .map((row) => buildExpiryAlertCandidate(context.companyId, row, scan.as_of_date, warningDays))
    .filter((candidate): candidate is ExpiryAlertCandidate => Boolean(candidate))
    .filter((candidate) => settings.overdue_enabled || candidate.days_until_expiry >= 0);

  return { candidates, settings: { ...settings, source_toggles: sourceToggles }, generated_at: new Date().toISOString() };
};

export const nextNotificationAt = (fromIso: string, settings: ExpiryAlertSettings) => {
  if (settings.repeat_frequency === "none") return null;
  if (settings.repeat_frequency === "daily") return new Date(Date.parse(fromIso) + msPerDay).toISOString();
  if (settings.repeat_frequency === "monthly") return addMonths(fromIso, 1);
  return new Date(Date.parse(fromIso) + (7 * msPerDay)).toISOString();
};

const weekStartKey = (isoDate: string) => {
  const date = new Date(`${dateOnly(isoDate)}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
};

export const notificationWindowKey = (settings: ExpiryAlertSettings, now: string) => {
  if (settings.repeat_frequency === "daily") return dateOnly(now);
  if (settings.repeat_frequency === "weekly") return weekStartKey(now);
  if (settings.repeat_frequency === "monthly") return dateOnly(now).slice(0, 7);
  return "once";
};

const safeAlert = (row: ExpiryAlertRecord | null) => {
  if (!row) return null;
  const { metadata_json, ...safe } = row;
  let metadata: Record<string, unknown> | null = null;
  if (metadata_json) {
    try {
      metadata = sanitizeNotificationMetadata(JSON.parse(metadata_json));
    } catch {
      metadata = null;
    }
  }
  return { ...safe, metadata };
};

const requireOwnEmployeeScope = async (env: Env, context: AuthActor) => {
  const employeeId = await repository.findUserEmployeeId(env, context.companyId, context.actorUserId);
  if (!employeeId) {
    throw new PermissionError("Your user account is not linked to an employee profile for self-service expiry alerts.", "EXPIRY_ALERT_PERMISSION_DENIED");
  }
  return employeeId;
};

const resolveEmployeeScope = async (env: Env, context: AuthActor) => {
  if (permissionService.hasAnyPermission(context, ["expiry_alerts.view"])) return null;
  if (permissionService.hasAnyPermission(context, ["expiry_alerts.view_own"])) return requireOwnEmployeeScope(env, context);
  throw new PermissionError("You do not have permission to view expiry alerts.", "EXPIRY_ALERT_PERMISSION_DENIED");
};

const assertCanViewAlert = async (env: Env, context: AuthActor, alert: ExpiryAlertRecord) => {
  if (permissionService.hasAnyPermission(context, ["expiry_alerts.view", "expiry_alerts.manage"])) {
    if (!permissionService.hasOutletAccess(context, alert.outlet_id)) {
      throw new PermissionError("You do not have access to this expiry alert.", "EXPIRY_ALERT_PERMISSION_DENIED");
    }
    return;
  }
  if (permissionService.hasAnyPermission(context, ["expiry_alerts.view_own"])) {
    const ownEmployeeId = await requireOwnEmployeeScope(env, context);
    if (!alert.employee_id || alert.employee_id !== ownEmployeeId) {
      throw new PermissionError("You can only view your own expiry alerts.", "EXPIRY_ALERT_PERMISSION_DENIED");
    }
    return;
  }
  throw new PermissionError("You do not have permission to view expiry alerts.", "EXPIRY_ALERT_PERMISSION_DENIED");
};

const assertCanMutateAlert = async (
  env: Env,
  context: AuthActor,
  alert: ExpiryAlertRecord,
  status: "acknowledged" | "resolved" | "dismissed" | "snoozed",
) => {
  if (status === "acknowledged" && permissionService.hasAnyPermission(context, ["expiry_alerts.acknowledge"])) {
    const ownEmployeeId = await repository.findUserEmployeeId(env, context.companyId, context.actorUserId);
    if (ownEmployeeId && alert.employee_id === ownEmployeeId) return;
  }
  const actionPermission = status === "acknowledged" ? "expiry_alerts.acknowledge" : status === "snoozed" ? "expiry_alerts.snooze" : `expiry_alerts.${status}`;
  if (!permissionService.hasAnyPermission(context, ["expiry_alerts.manage", actionPermission])) {
    throw new PermissionError("You do not have permission to update this expiry alert.", "EXPIRY_ALERT_PERMISSION_DENIED");
  }
  if (!permissionService.hasAnyPermission(context, ["expiry_alerts.view", "expiry_alerts.manage"])) {
    throw new PermissionError("You do not have permission to update this expiry alert.", "EXPIRY_ALERT_PERMISSION_DENIED");
  }
  if (!permissionService.hasOutletAccess(context, alert.outlet_id)) {
    throw new PermissionError("You do not have access to this expiry alert.", "EXPIRY_ALERT_PERMISSION_DENIED");
  }
};

const normalizeFutureSnoozeDate = (value: string | null | undefined, now: string) => {
  if (!value?.trim()) {
    throw new AppError("Snooze until date is required.", "EXPIRY_ALERT_SNOOZE_INVALID", 400);
  }
  const trimmed = value.trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const isIso = /^\d{4}-\d{2}-\d{2}T/.test(trimmed);
  if (!isDateOnly && !isIso) {
    throw new AppError("Use a valid future snooze date in YYYY-MM-DD or ISO format.", "EXPIRY_ALERT_SNOOZE_INVALID", 400);
  }
  const parsed = Date.parse(isDateOnly ? `${trimmed}T00:00:00.000Z` : trimmed);
  if (!Number.isFinite(parsed)) {
    throw new AppError("Use a valid future snooze date in YYYY-MM-DD or ISO format.", "EXPIRY_ALERT_SNOOZE_INVALID", 400);
  }
  const normalized = new Date(parsed).toISOString().slice(0, 10);
  if (normalized <= dateOnly(now)) {
    throw new AppError("Choose a future date for snoozing this expiry alert.", "EXPIRY_ALERT_SNOOZE_INVALID", 400);
  }
  return isDateOnly ? normalized : new Date(parsed).toISOString();
};

export const upsertCandidateAlert = async (
  env: Env,
  context: AuthActor,
  candidate: ExpiryAlertCandidate,
  settings: ExpiryAlertSettings,
  asOfDate: string,
) => {
  const timestamp = new Date().toISOString();
  const existing = await repository.getAlertByIdempotency(env, context.companyId, candidate.idempotency_key);
  if (existing) {
    await repository.refreshAlert(env, {
      ...candidate,
      id: existing.id,
      company_id: context.companyId,
      last_detected_at: timestamp,
      next_notification_at: existing.next_notification_at ?? null,
      metadata_json: JSON.stringify(candidate.metadata),
      updated_at: timestamp,
    });
    return { alert: await repository.getAlertById(env, context.companyId, existing.id), created: false };
  }
  const id = createPrefixedId("expiry_alert");
  await repository.insertAlert(env, {
    ...candidate,
    id,
    company_id: context.companyId,
    first_detected_at: timestamp,
    last_detected_at: timestamp,
    next_notification_at: null,
    metadata_json: JSON.stringify(candidate.metadata),
    created_at: timestamp,
    updated_at: timestamp,
  });
  return { alert: await repository.getAlertById(env, context.companyId, id), created: true };
};

export const shouldNotify = (alert: ExpiryAlertRecord, settings: ExpiryAlertSettings, now: string) => {
  if (!settings.in_app_enabled) return false;
  if (!activeStatuses.has(String(alert.status))) return false;
  if (String(alert.status) === "snoozed" && isFutureSnooze(alert.snoozed_until, now)) return false;
  if (settings.repeat_frequency === "none" && alert.last_notified_at) return false;
  if (alert.next_notification_at) return alert.next_notification_at <= now;
  if (String(alert.status) === "snoozed" && isPastSnooze(alert.snoozed_until, now)) return true;
  return !alert.last_notified_at || settings.repeat_frequency !== "none";
};

const extractNotificationReferences = (result: any) => {
  const notification = Array.isArray(result?.notifications) ? result.notifications[0] : null;
  return {
    notificationId: notification?.id ?? notification?.notification_id ?? null,
    emailNotificationId: notification?.email_notification_id ?? notification?.email_job_id ?? notification?.email_id ?? null,
  };
};

const linkNotificationReferences = async (
  env: Env,
  context: AuthActor,
  alert: ExpiryAlertRecord,
  settings: ExpiryAlertSettings,
  result: any,
  notifiedAt: string,
) => {
  if ((result?.created_count ?? 0) <= 0) return;
  const { notificationId, emailNotificationId } = extractNotificationReferences(result);
  try {
    await repository.updateAlertNotificationRefs(env, {
      companyId: context.companyId,
      id: alert.id,
      notificationId,
      emailNotificationId,
      lastNotifiedAt: notifiedAt,
      nextNotificationAt: nextNotificationAt(notifiedAt, settings),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await createAuditLog(env, {
      companyId: context.companyId,
      outletId: alert.outlet_id ?? undefined,
      module: "expiry_alerts",
      action: "expiry_alert_notification_link_failed",
      entityType: "expiry_alert",
      entityId: alert.id,
      employeeId: alert.employee_id ?? undefined,
      actorId: context.actorUserId,
      details: { notification_id_available: Boolean(notificationId), email_notification_id_available: Boolean(emailNotificationId), reason: error instanceof Error ? error.message : "unknown" },
      requestId: context.requestId,
    });
  }
};

export const notifyForAlert = async (env: Env, context: AuthActor, alert: ExpiryAlertRecord, settings: ExpiryAlertSettings, now = new Date().toISOString()) => {
  if (!(await isExpirySourceTypeEnabled(env, context.companyId, alert.source_type, context))) {
    return { created_count: 0, notifications: [], skipped_disabled_module: true };
  }
  const metadata = safeJson<Record<string, unknown>>(alert.metadata_json, {});
  const allowEmail = settings.email_enabled && severityRank[String(alert.severity)] >= severityRank[settings.minimum_email_severity];
  const employeeIds = settings.notify_employee_self && alert.employee_id ? [alert.employee_id] : [];
  const windowKey = notificationWindowKey(settings, now);
  const result = await safeNotifyResolvedRecipients(env, context.companyId, {
    employeeIds,
    roleKeys: settings.notify_roles,
    permissionKeys: settings.notify_permissions,
    outletId: alert.outlet_id,
    fallbackToAdmins: settings.fallback_to_admins,
  }, {
    notification_type: "expiry_alert",
    category:
      ["employee_document", "employee_passport", "employee_work_permit"].includes(alert.source_type)
        ? "documents"
        : ["contract", "probation"].includes(alert.source_type)
          ? "contracts"
          : alert.source_type === "long_leave_return"
            ? "long_leave"
            : alert.source_type === "asset_assignment"
              ? "assets"
              : alert.source_type === "uniform_return"
                ? "uniforms"
                : "system",
    priority: alert.severity === "critical" ? "urgent" : alert.severity === "high" ? "high" : "normal",
    title: alert.title,
    message: alert.message,
    action_url: alert.action_url,
    action_label: "Review expiry",
    entity_type: "expiry_alert",
    entity_id: alert.id,
    event_key: "expiry_alert_detected",
    idempotency_key: `expiry-alert-notify:${alert.id}:${alert.severity}:${alert.expiry_date}:${windowKey}`,
    outlet_id: alert.outlet_id,
    department_id: alert.department_id,
    metadata: { ...metadata, expiry_alert_id: alert.id, notification_window_key: windowKey, email_disabled: !allowEmail },
  }, {
    actorId: context.actorUserId,
    optional: false,
    excludeActor: true,
    requestId: context.requestId,
  });
  await linkNotificationReferences(env, context, alert, settings, result, now);
  return result;
};

export const previewScan = async (env: Env, context: AuthActor, scan: ExpiryScanFilters) => {
  if (!permissionService.hasAnyPermission(context, ["expiry_alerts.scan", "expiry_alerts.view"])) {
    throw new PermissionError("You do not have permission to scan expiry alerts.", "EXPIRY_ALERT_PERMISSION_DENIED");
  }
  const result = await collectExpiryCandidates(env, context, scan);
  return {
    candidates: result.candidates,
    count: result.candidates.length,
    settings: result.settings,
    generated_at: result.generated_at,
    preview: true,
  };
};

export const runScan = async (env: Env, context: AuthActor, scan: ExpiryScanFilters) => {
  if (!permissionService.hasAnyPermission(context, ["expiry_alerts.scan", "expiry_alerts.manage"])) {
    throw new PermissionError("You do not have permission to run expiry alert scans.", "EXPIRY_ALERT_PERMISSION_DENIED");
  }
  const result = await collectExpiryCandidates(env, context, scan);
  const now = new Date().toISOString();
  let created = 0;
  let refreshed = 0;
  let notified = 0;
  const alerts = [];
  for (const candidate of result.candidates) {
    const upserted = await upsertCandidateAlert(env, context, candidate, result.settings, scan.as_of_date);
    if (!upserted.alert) continue;
    if (upserted.created) created += 1;
    else refreshed += 1;
    if (shouldNotify(upserted.alert, result.settings, now)) {
      const notificationResult = await notifyForAlert(env, context, upserted.alert, result.settings, now);
      notified += notificationResult.created_count ?? 0;
    }
    alerts.push(safeAlert(upserted.alert));
  }
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "expiry_alerts",
    action: "expiry_alert_scan_run",
    entityType: "expiry_alert_scan",
    entityId: scan.as_of_date,
    actorId: context.actorUserId,
    details: { candidates: result.candidates.length, created, refreshed, notified, source_type: scan.source_type },
    requestId: context.requestId,
  });
  return { created, refreshed, notified, scanned: result.candidates.length, alerts, generated_at: result.generated_at };
};

const pagination = (filters: ExpiryAlertListFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / filters.page_size),
});

export const listAlerts = async (env: Env, context: AuthActor, filters: ExpiryAlertListFilters) => {
  if (!permissionService.hasAnyPermission(context, ["expiry_alerts.view", "expiry_alerts.view_own"])) {
    throw new PermissionError("You do not have permission to view expiry alerts.", "EXPIRY_ALERT_PERMISSION_DENIED");
  }
  const employeeIdScope = await resolveEmployeeScope(env, context);
  const enabledSourceTypes = await getEnabledExpirySourceTypes(env, context.companyId, context);
  if (filters.source_type && !enabledSourceTypes.has(filters.source_type)) {
    return { rows: [], pagination: pagination(filters, 0) };
  }
  const scopedFilters = { ...filters, source_types: [...enabledSourceTypes] };
  const total = await repository.countAlerts(env, context.companyId, scopedFilters, context.outletIds, context.isSuperAdmin, employeeIdScope);
  return {
    rows: (await repository.listAlerts(env, context.companyId, scopedFilters, context.outletIds, context.isSuperAdmin, employeeIdScope)).map(safeAlert),
    pagination: pagination(scopedFilters, total),
  };
};

export const getAlert = async (env: Env, context: AuthActor, id: string) => {
  const alert = await repository.getAlertById(env, context.companyId, id);
  if (!alert) throw new NotFoundError("Expiry alert could not be found.");
  if (!(await isExpirySourceTypeEnabled(env, context.companyId, alert.source_type, context))) {
    throw new NotFoundError("Expiry alert could not be found.");
  }
  await assertCanViewAlert(env, context, alert);
  return { alert: safeAlert(alert) };
};

const mutateAlertStatus = async (
  env: Env,
  context: AuthActor,
  id: string,
  status: "acknowledged" | "resolved" | "dismissed" | "snoozed",
  input: ExpiryActionInput,
) => {
  const alert = await repository.getAlertById(env, context.companyId, id);
  if (!alert) throw new NotFoundError("Expiry alert could not be found.");
  await assertCanMutateAlert(env, context, alert, status);
  if ((status === "resolved" || status === "dismissed" || status === "snoozed") && !input.reason?.trim()) {
    throw new AppError("A reason is required to update this expiry alert.", "EXPIRY_ALERT_REASON_REQUIRED", 400);
  }
  const timestamp = new Date().toISOString();
  const snoozedUntil = status === "snoozed" ? normalizeFutureSnoozeDate(input.snoozed_until, timestamp) : null;
  await repository.updateAlertStatus(env, {
    companyId: context.companyId,
    id,
    status,
    actorId: context.actorUserId,
    timestamp,
    reason: input.reason?.trim() ?? null,
    snoozedUntil,
  });
  await createAuditLog(env, {
    companyId: context.companyId,
    outletId: alert.outlet_id ?? undefined,
    module: "expiry_alerts",
    action: `expiry_alert_${status}`,
    entityType: "expiry_alert",
    entityId: id,
    employeeId: alert.employee_id ?? undefined,
    actorId: context.actorUserId,
    reason: input.reason?.trim(),
    requestId: context.requestId,
  });
  return getAlert(env, context, id);
};

export const acknowledgeAlert = (env: Env, context: AuthActor, id: string, input: ExpiryActionInput) =>
  mutateAlertStatus(env, context, id, "acknowledged", input);
export const resolveAlert = (env: Env, context: AuthActor, id: string, input: ExpiryActionInput) =>
  mutateAlertStatus(env, context, id, "resolved", input);
export const dismissAlert = (env: Env, context: AuthActor, id: string, input: ExpiryActionInput) =>
  mutateAlertStatus(env, context, id, "dismissed", input);
export const snoozeAlert = (env: Env, context: AuthActor, id: string, input: ExpiryActionInput) =>
  mutateAlertStatus(env, context, id, "snoozed", input);

export const getSummary = async (env: Env, context: AuthActor) => {
  const employeeIdScope = await resolveEmployeeScope(env, context);
  const enabledSourceTypes = [...(await getEnabledExpirySourceTypes(env, context.companyId, context))];
  const summary = await repository.summary(env, context.companyId, context.outletIds, context.isSuperAdmin, employeeIdScope, enabledSourceTypes) ?? {
    active_count: 0,
    open_count: 0,
    critical_count: 0,
    high_count: 0,
    warning_count: 0,
    overdue_count: 0,
    due_today_count: 0,
    due_7_days_count: 0,
    due_30_days_count: 0,
  };
  const sourceRows = await repository.sourceSummary(env, context.companyId, context.outletIds, context.isSuperAdmin, employeeIdScope, enabledSourceTypes);
  return {
    summary: {
      ...summary,
      by_source_type: Object.fromEntries(sourceRows.map((row) => [row.source_type, Number(row.total ?? 0)])),
    },
  };
};
