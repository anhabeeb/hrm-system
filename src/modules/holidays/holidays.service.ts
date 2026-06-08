import * as calculation from "./holiday-calculation.service";
import * as repository from "./holidays.repository";
import type {
  HolidayCheckInput,
  HolidayFilters,
  HolidayInput,
  HolidayRecord,
  HolidaySettings,
  HolidaySettingsInput,
} from "./holidays.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({
  page,
  page_size: pageSize,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
});

export const defaultHolidaySettings = (): HolidaySettings => ({
  holiday_module_enabled: 1,
  public_holidays_enabled: 1,
  company_holidays_enabled: 1,
  outlet_specific_holidays_enabled: 1,
  optional_holidays_enabled: 1,
  other_holidays_enabled: 1,
  holiday_leave_rules_enabled: 1,
  holiday_attendance_rules_enabled: 1,
  holiday_roster_rules_enabled: 1,
  holidays_exclude_from_paid_leave: 1,
  holidays_exclude_from_unpaid_leave: 0,
  exclude_holidays_from_leave: 0,
  pay_holidays_during_long_leave: 0,
  holidays_count_as_attendance_excused: 1,
  holiday_work_overtime_enabled: 1,
  replacement_holidays_enabled: 0,
  holiday_import_enabled: 1,
  holiday_approval_required: 0,
  require_reason_for_holiday_changes: 1,
  default_holiday_pay_multiplier: 1.5,
});

export const getHolidaySettings = async (env: Env, companyId: string) =>
  ({ ...defaultHolidaySettings(), ...((await repository.getSettings(env, companyId)) ?? {}) }) as HolidaySettings;

const audit = async (
  env: Env,
  context: AuthActor,
  input: { action: string; entityType: string; entityId: string; outletId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: "holidays",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: context.actorUserId,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason ?? undefined,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) console.error("Holiday audit log could not be recorded", { action: input.action, requestId: context.requestId });
};

const ensureOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (!permissionService.hasOutletAccess(context, outletId)) {
    throw new OutletAccessError("You do not have access to this holiday outlet.");
  }
};

const assertSettingsEnabled = async (env: Env, companyId: string) => {
  const settings = await getHolidaySettings(env, companyId);
  if (settings.holiday_module_enabled !== 1) {
    throw new AppError("Holiday calendar is disabled for this company.", "HOLIDAY_CALENDAR_DISABLED", 409);
  }
  return settings;
};

const assertReason = (reason?: string | null) => {
  if (!reason?.trim()) throw new AppError("A reason is required for holiday changes.", "HOLIDAY_REASON_REQUIRED", 400);
};

const normalizeType = (type: string) =>
  type === "public" ? "public_holiday" : type === "company" ? "company_holiday" : type;

const toRecord = (context: AuthActor, input: HolidayInput, id = createPrefixedId("holiday")): HolidayRecord => {
  const timestamp = nowIso();
  const recurringMonth = input.recurrence_month ?? Number(input.date.slice(5, 7));
  const recurringDay = input.recurrence_day ?? Number(input.date.slice(8, 10));
  const appliesToAll = input.applies_to_all_outlets ?? !input.outlet_id;
  return {
    id,
    company_id: context.companyId,
    name: input.name,
    holiday_type: normalizeType(input.holiday_type),
    code: input.code || null,
    date: input.date,
    start_date: input.date,
    end_date: input.end_date ?? null,
    is_recurring: input.is_recurring ? 1 : 0,
    recurrence_rule: input.recurrence_rule ?? (input.is_recurring ? "yearly" : null),
    recurrence_month: recurringMonth,
    recurrence_day: recurringDay,
    outlet_id: input.outlet_id ?? null,
    department_id: input.department_id ?? null,
    applies_to_all_outlets: appliesToAll ? 1 : 0,
    applies_to_local_employees: input.applies_to_local_employees === false ? 0 : 1,
    applies_to_foreign_employees: input.applies_to_foreign_employees === false ? 0 : 1,
    paid_holiday: input.paid_holiday === false ? 0 : 1,
    counts_as_working_day: input.counts_as_working_day ? 1 : 0,
    affects_leave_duration: input.affects_leave_duration === false ? 0 : 1,
    affects_attendance_absence: input.affects_attendance_absence === false ? 0 : 1,
    affects_overtime: input.affects_overtime === false ? 0 : 1,
    affects_long_leave_payroll: input.affects_long_leave_payroll === false ? 0 : 1,
    requires_work_pay_rate_multiplier: input.requires_work_pay_rate_multiplier ?? null,
    status: input.status ?? "active",
    source: "manual",
    notes: input.notes ?? null,
    created_by: context.actorUserId,
    updated_by: context.actorUserId,
    created_at: timestamp,
    updated_at: timestamp,
  };
};

const assertUnique = async (env: Env, context: AuthActor, input: Pick<HolidayInput, "code" | "name" | "date" | "outlet_id">, excludeId?: string) => {
  if (input.code) {
    const duplicateCode = await repository.findByCode(env, context.companyId, input.code, excludeId);
    if (duplicateCode) throw new AppError("Holiday code already exists for this company.", "HOLIDAY_DUPLICATE_CODE", 409);
  }
  const duplicate = await repository.findDuplicateActiveHoliday(env, context.companyId, input.name, input.date, input.outlet_id, excludeId);
  if (duplicate) {
    throw new AppError("An active holiday already exists for this name, date, and outlet.", "HOLIDAY_DUPLICATE_ACTIVE_DATE", 409);
  }
};

export const listHolidays = async (env: Env, context: AuthActor, filters: HolidayFilters) => {
  if (filters.outlet_id) ensureOutletAccess(context, filters.outlet_id);
  const result = await repository.listHolidays(env, context.companyId, filters);
  return {
    rows: result.rows,
    pagination: pagination(filters.page, filters.page_size, result.total),
    filters,
    generated_at: nowIso(),
  };
};

export const getHoliday = async (env: Env, context: AuthActor, id: string) => {
  const holiday = await repository.findHoliday(env, context.companyId, id);
  if (!holiday) throw new NotFoundError("Holiday could not be found.");
  ensureOutletAccess(context, holiday.outlet_id);
  return { holiday };
};

export const createHoliday = async (env: Env, context: AuthActor, input: HolidayInput) => {
  assertReason(input.reason);
  await assertSettingsEnabled(env, context.companyId);
  ensureOutletAccess(context, input.outlet_id);
  await assertUnique(env, context, input);
  const record = toRecord(context, input);
  await repository.createHoliday(env, record);
  await repository.replaceHolidayOutlet(env, context.companyId, record.id, record.applies_to_all_outlets === 1 ? null : record.outlet_id);
  await audit(env, context, { action: "holiday_created", entityType: "holiday", entityId: record.id, outletId: record.outlet_id, newValue: record, reason: input.reason });
  return { holiday: await repository.findHoliday(env, context.companyId, record.id) };
};

export const updateHoliday = async (env: Env, context: AuthActor, id: string, input: Partial<HolidayInput> & { reason?: string }) => {
  assertReason(input.reason);
  const existing = await repository.findHoliday(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Holiday could not be found.");
  ensureOutletAccess(context, existing.outlet_id);
  ensureOutletAccess(context, input.outlet_id);
  const nextInput = {
    name: input.name ?? existing.name,
    date: input.date ?? existing.date,
    outlet_id: input.outlet_id === undefined ? existing.outlet_id : input.outlet_id,
    code: input.code === undefined ? existing.code ?? undefined : input.code ?? undefined,
  };
  await assertUnique(env, context, nextInput, id);
  const nextValues: Partial<HolidayRecord> = {
    name: input.name,
    code: input.code === undefined ? undefined : input.code ?? null,
    holiday_type: input.holiday_type ? normalizeType(input.holiday_type) : undefined,
    date: input.date,
    end_date: input.end_date === undefined ? undefined : input.end_date ?? null,
    is_recurring: input.is_recurring === undefined ? undefined : input.is_recurring ? 1 : 0,
    recurrence_rule: input.recurrence_rule === undefined ? undefined : input.recurrence_rule ?? null,
    recurrence_month: input.recurrence_month === undefined ? undefined : input.recurrence_month ?? null,
    recurrence_day: input.recurrence_day === undefined ? undefined : input.recurrence_day ?? null,
    outlet_id: input.outlet_id === undefined ? undefined : input.outlet_id ?? null,
    department_id: input.department_id === undefined ? undefined : input.department_id ?? null,
    applies_to_all_outlets: input.applies_to_all_outlets === undefined ? undefined : input.applies_to_all_outlets ? 1 : 0,
    applies_to_local_employees: input.applies_to_local_employees === undefined ? undefined : input.applies_to_local_employees ? 1 : 0,
    applies_to_foreign_employees: input.applies_to_foreign_employees === undefined ? undefined : input.applies_to_foreign_employees ? 1 : 0,
    paid_holiday: input.paid_holiday === undefined ? undefined : input.paid_holiday ? 1 : 0,
    counts_as_working_day: input.counts_as_working_day === undefined ? undefined : input.counts_as_working_day ? 1 : 0,
    affects_leave_duration: input.affects_leave_duration === undefined ? undefined : input.affects_leave_duration ? 1 : 0,
    affects_attendance_absence: input.affects_attendance_absence === undefined ? undefined : input.affects_attendance_absence ? 1 : 0,
    affects_overtime: input.affects_overtime === undefined ? undefined : input.affects_overtime ? 1 : 0,
    affects_long_leave_payroll: input.affects_long_leave_payroll === undefined ? undefined : input.affects_long_leave_payroll ? 1 : 0,
    requires_work_pay_rate_multiplier: input.requires_work_pay_rate_multiplier === undefined ? undefined : input.requires_work_pay_rate_multiplier ?? null,
    status: input.status,
    notes: input.notes === undefined ? undefined : input.notes ?? null,
    updated_by: context.actorUserId,
  };
  await repository.updateHoliday(env, context.companyId, id, nextValues);
  const updated = await repository.findHoliday(env, context.companyId, id);
  await repository.replaceHolidayOutlet(env, context.companyId, id, updated?.applies_to_all_outlets === 1 ? null : updated?.outlet_id);
  await audit(env, context, { action: "holiday_updated", entityType: "holiday", entityId: id, outletId: updated?.outlet_id, oldValue: existing, newValue: updated, reason: input.reason });
  return { holiday: updated };
};

export const archiveHoliday = async (env: Env, context: AuthActor, id: string, reason: string) => {
  assertReason(reason);
  const existing = await repository.findHoliday(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Holiday could not be found.");
  ensureOutletAccess(context, existing.outlet_id);
  await repository.archiveHoliday(env, context.companyId, id, context.actorUserId, reason);
  await audit(env, context, { action: "holiday_archived", entityType: "holiday", entityId: id, outletId: existing.outlet_id, oldValue: existing, reason });
  return { holiday: await repository.findHoliday(env, context.companyId, id) };
};

export const restoreHoliday = async (env: Env, context: AuthActor, id: string, reason: string) => {
  assertReason(reason);
  const existing = await repository.findHoliday(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Holiday could not be found.");
  ensureOutletAccess(context, existing.outlet_id);
  await repository.restoreHoliday(env, context.companyId, id, context.actorUserId);
  await audit(env, context, { action: "holiday_restored", entityType: "holiday", entityId: id, outletId: existing.outlet_id, oldValue: existing, reason });
  return { holiday: await repository.findHoliday(env, context.companyId, id) };
};

export const calendar = async (env: Env, context: AuthActor, filters: HolidayFilters) => {
  const settings = await getHolidaySettings(env, context.companyId);
  const fromDate = filters.from_date ?? (filters.year && filters.month ? `${filters.year}-${String(filters.month).padStart(2, "0")}-01` : `${filters.year ?? new Date().getUTCFullYear()}-01-01`);
  const toDate = filters.to_date ?? (filters.year && filters.month ? new Date(Date.UTC(filters.year, filters.month, 0)).toISOString().slice(0, 10) : `${filters.year ?? new Date().getUTCFullYear()}-12-31`);
  const events = await calculation.getHolidaysForRange(env, context.companyId, fromDate, toDate, {
    ...filters,
    settings,
    outletId: filters.outlet_id,
    employeeType: filters.employee_type,
  });
  return {
    events,
    range: { from_date: fromDate, to_date: toDate },
    summary: { total: events.length, paid: events.filter((event) => event.paid_holiday === 1).length },
    generated_at: nowIso(),
  };
};

export const range = async (env: Env, context: AuthActor, filters: HolidayFilters) => calendar(env, context, filters);

export const checkDate = async (env: Env, context: AuthActor, input: HolidayCheckInput) => {
  ensureOutletAccess(context, input.outlet_id);
  const settings = await getHolidaySettings(env, context.companyId);
  return calculation.isHolidayForEmployee(env, context.companyId, input.employee_id, input.date, input.outlet_id, settings);
};

export const bulkUpsert = async (env: Env, context: AuthActor, rows: HolidayInput[]) => {
  const results: Array<{ row: number; success: boolean; id?: string; error?: string }> = [];
  for (let index = 0; index < rows.length; index += 1) {
    try {
      const result = await createHoliday(env, context, rows[index]);
      results.push({ row: index + 1, success: true, id: result.holiday?.id });
    } catch (error) {
      results.push({ row: index + 1, success: false, error: error instanceof Error ? error.message : "Holiday could not be imported." });
    }
  }
  await audit(env, context, { action: "holiday_imported", entityType: "holiday_import", entityId: context.companyId, newValue: { rows: rows.length, results } });
  return { results };
};

export const getSettings = async (env: Env, context: AuthActor) => ({ settings: await getHolidaySettings(env, context.companyId) });

export const updateSettings = async (env: Env, context: AuthActor, input: HolidaySettingsInput) => {
  const current = await getHolidaySettings(env, context.companyId);
  const next: HolidaySettings = {
    ...current,
    holiday_module_enabled: input.holiday_module_enabled === undefined ? current.holiday_module_enabled : Number(input.holiday_module_enabled),
    public_holidays_enabled: input.public_holidays_enabled === undefined ? current.public_holidays_enabled : Number(input.public_holidays_enabled),
    company_holidays_enabled: input.company_holidays_enabled === undefined ? current.company_holidays_enabled : Number(input.company_holidays_enabled),
    outlet_specific_holidays_enabled: input.outlet_specific_holidays_enabled === undefined ? current.outlet_specific_holidays_enabled : Number(input.outlet_specific_holidays_enabled),
    optional_holidays_enabled: input.optional_holidays_enabled === undefined ? current.optional_holidays_enabled : Number(input.optional_holidays_enabled),
    other_holidays_enabled: input.other_holidays_enabled === undefined ? current.other_holidays_enabled : Number(input.other_holidays_enabled),
    holiday_leave_rules_enabled: input.holiday_leave_rules_enabled === undefined ? current.holiday_leave_rules_enabled : Number(input.holiday_leave_rules_enabled),
    holiday_attendance_rules_enabled: input.holiday_attendance_rules_enabled === undefined ? current.holiday_attendance_rules_enabled : Number(input.holiday_attendance_rules_enabled),
    holiday_roster_rules_enabled: input.holiday_roster_rules_enabled === undefined ? current.holiday_roster_rules_enabled : Number(input.holiday_roster_rules_enabled),
    holidays_exclude_from_paid_leave: input.holidays_exclude_from_paid_leave === undefined ? current.holidays_exclude_from_paid_leave : Number(input.holidays_exclude_from_paid_leave),
    holidays_exclude_from_unpaid_leave: input.holidays_exclude_from_unpaid_leave === undefined ? current.holidays_exclude_from_unpaid_leave : Number(input.holidays_exclude_from_unpaid_leave),
    exclude_holidays_from_leave: input.exclude_holidays_from_leave === undefined ? current.exclude_holidays_from_leave : Number(input.exclude_holidays_from_leave),
    pay_holidays_during_long_leave: input.pay_holidays_during_long_leave === undefined ? current.pay_holidays_during_long_leave : Number(input.pay_holidays_during_long_leave),
    holidays_count_as_attendance_excused: input.holidays_count_as_attendance_excused === undefined ? current.holidays_count_as_attendance_excused : Number(input.holidays_count_as_attendance_excused),
    holiday_work_overtime_enabled: input.holiday_work_overtime_enabled === undefined ? current.holiday_work_overtime_enabled : Number(input.holiday_work_overtime_enabled),
    replacement_holidays_enabled: input.replacement_holidays_enabled === undefined ? current.replacement_holidays_enabled : Number(input.replacement_holidays_enabled),
    holiday_import_enabled: input.holiday_import_enabled === undefined ? current.holiday_import_enabled : Number(input.holiday_import_enabled),
    holiday_approval_required: input.holiday_approval_required === undefined ? current.holiday_approval_required : Number(input.holiday_approval_required),
    require_reason_for_holiday_changes: input.require_reason_for_holiday_changes === undefined ? current.require_reason_for_holiday_changes : Number(input.require_reason_for_holiday_changes),
    default_holiday_pay_multiplier: input.default_holiday_pay_multiplier ?? current.default_holiday_pay_multiplier,
  };
  const existing = await repository.getSettings(env, context.companyId);
  if (existing) await repository.updateSettings(env, context.companyId, next);
  else await repository.insertSettings(env, context.companyId, next);
  await audit(env, context, { action: "holiday_settings_changed", entityType: "holiday_settings", entityId: context.companyId, oldValue: current, newValue: next, reason: input.reason });
  return { settings: await getHolidaySettings(env, context.companyId) };
};

export const assertNoOpenHolidayDuplicateForTests = async (env: Env, context: AuthActor, input: HolidayInput) => {
  await assertUnique(env, context, input);
  if (input.holiday_type === "optional_holiday") {
    const settings = await getHolidaySettings(env, context.companyId);
    if (settings.optional_holidays_enabled !== 1) throw new ConflictError("Optional holidays are disabled.");
  }
};
