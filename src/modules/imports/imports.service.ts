import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, PermissionError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import { IMPORT_TEMPLATES, getTemplate } from "./imports.templates";
import { parseCsv, sanitizeRow, templateToCsv, validateHeaders } from "./imports.parser";
import * as repository from "./imports.repository";
import type {
  ImportJob,
  ImportJobCreateInput,
  ImportJobRow,
  ImportListFilters,
  ImportMode,
  ImportPreviewInput,
  ImportRowsFilters,
  ImportTemplate,
  ImportValidationResult,
} from "./imports.types";

const unsafeKeys = new Set(["password", "password_hash", "token", "secret", "totp_secret", "device_token", "raw_payload", "file_storage_key", "raw_file", "metadata_json"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const moneyPattern = /^-?\d+(\.\d{1,2})?$/;
const timePattern = /^(\d{2}:\d{2}(:\d{2})?|\d{4}-\d{2}-\d{2}T.+)$/;
const lockedPayrollStatuses = new Set(["finalizing", "finalized", "locked", "paid"]);

const nowIso = () => new Date().toISOString();
const nonEmpty = (value: unknown) => String(value ?? "").trim();
const bool = (value: unknown, fallback = false) => {
  const normalized = nonEmpty(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "y"].includes(normalized);
};
const amountMinor = (value: unknown) => Math.round(Number(nonEmpty(value)) * 100);
const safeJson = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "string" && item.length > 500 ? `${item.slice(0, 500)}...` : item);
const parseRowJson = (row: ImportJobRow) => row.normalized_data_json ? JSON.parse(row.normalized_data_json) as Record<string, string> : {};
const stableTargetId = (prefix: string, row: ImportJobRow, suffix = "") => `${prefix}_${row.id.replace(/^import_row_?/, "")}${suffix}`;

const requiredActionPermission = (action: "templates" | "view" | "upload" | "preview" | "apply" | "cancel" | "errors") => ({
  templates: "imports.templates.view",
  view: "imports.view",
  upload: "imports.upload",
  preview: "imports.preview",
  apply: "imports.apply",
  cancel: "imports.cancel",
  errors: "imports.errors.view",
}[action]);

const requirePermission = (actor: AuthActor, permission: string, code = "IMPORT_PERMISSION_DENIED") => {
  if (!permissionService.hasPermission(actor, permission)) throw new PermissionError("You do not have permission to manage imports.", code);
};

const requireImportAccess = (actor: AuthActor, template: ImportTemplate, action: "upload" | "preview" | "apply") => {
  requirePermission(actor, requiredActionPermission(action));
  requirePermission(actor, template.required_permission);
  if (template.sensitive && !permissionService.hasPermission(actor, "imports.sensitive.manage")) {
    throw new PermissionError("This import contains sensitive fields and requires sensitive import permission.", "IMPORT_SENSITIVE_PERMISSION_REQUIRED");
  }
};

const assertAssetsUniformsImportEnabled = async (env: Env, actor: AuthActor) => {
  const [assetsEnabled, uniformsEnabled] = await Promise.all([
    settingsService.isFeatureEnabled(env, actor.companyId, "asset_tracking", actor),
    settingsService.isFeatureEnabled(env, actor.companyId, "uniform_tracking", actor),
  ]);
  if (!assetsEnabled || !uniformsEnabled) {
    throw new AppError(
      "Asset Tracking and Uniform Tracking must both be enabled before importing asset/uniform assignments.",
      "ASSETS_UNIFORMS_IMPORT_DISABLED",
      403,
    );
  }
};

const assertLeaveImportEnabled = async (env: Env, actor: AuthActor) => {
  const enabled = await settingsService.isFeatureEnabled(env, actor.companyId, "leave_management", actor);
  if (!enabled) {
    throw new AppError(
      "Leave Management is disabled. Enable it in Settings to use this module.",
      "LEAVE_MANAGEMENT_DISABLED",
      403,
    );
  }
};

const assertAttendanceImportEnabled = async (env: Env, actor: AuthActor) => {
  const enabled = await settingsService.isFeatureEnabled(env, actor.companyId, "attendance", actor);
  if (!enabled) {
    throw new AppError(
      "Attendance Management is disabled. Enable it in Settings to use this module.",
      "ATTENDANCE_MANAGEMENT_DISABLED",
      403,
    );
  }
};

const assertPayrollImportEnabled = async (env: Env, actor: AuthActor, subFeature?: settingsService.PayrollSubFeatureKey) => {
  const enabled = await settingsService.isFeatureEnabled(env, actor.companyId, "payroll", actor);
  if (!enabled) {
    throw new AppError(
      "Payroll Management is disabled. Enable it in Settings to use this module.",
      "PAYROLL_MANAGEMENT_DISABLED",
      403,
    );
  }
  if (subFeature && !(await settingsService.isPayrollSubFeatureEnabled(env, actor.companyId, subFeature))) {
    throw new AppError(
      "This payroll import template is disabled in Payroll Settings.",
      "PAYROLL_IMPORT_SUBFEATURE_DISABLED",
      403,
    );
  }
};

const ensureOutletScope = (actor: AuthActor, outletId?: string | null) => {
  if (!outletId || actor.isAdmin || actor.isSuperAdmin || actor.outletIds.length === 0) return;
  if (!actor.outletIds.includes(outletId)) throw new PermissionError("You cannot import rows for an outlet outside your scope.", "IMPORT_PERMISSION_DENIED");
};

const audit = (env: Env, actor: AuthActor, action: string, details: Record<string, unknown>) =>
  createAuditLog(env, {
    companyId: actor.companyId,
    module: "imports",
    action,
    entityType: "import_job",
    entityId: String(details.import_job_id ?? details.import_type ?? actor.companyId),
    actorId: actor.actorUserId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    details,
    requestId: actor.requestId,
  });

const templateFeatureEnabled = async (env: Env, actor: AuthActor, template: ImportTemplate) => {
  if (template.import_type === "attendance") {
    return settingsService.isFeatureEnabled(env, actor.companyId, "attendance", actor);
  }
  if (template.import_type === "leave_balances") {
    return settingsService.isFeatureEnabled(env, actor.companyId, "leave_management", actor);
  }
  if (template.import_type === "assets_uniforms") {
    const [assetsEnabled, uniformsEnabled] = await Promise.all([
      settingsService.isFeatureEnabled(env, actor.companyId, "asset_tracking", actor),
      settingsService.isFeatureEnabled(env, actor.companyId, "uniform_tracking", actor),
    ]);
    return assetsEnabled && uniformsEnabled;
  }
  if (template.import_type === "salary_compensation") {
    return settingsService.isFeatureEnabled(env, actor.companyId, "payroll", actor);
  }
  if (template.import_type === "advances_loans") {
    const [payrollEnabled, advancesEnabled, loansEnabled] = await Promise.all([
      settingsService.isFeatureEnabled(env, actor.companyId, "payroll", actor),
      settingsService.isPayrollSubFeatureEnabled(env, actor.companyId, "payroll.advances_enabled"),
      settingsService.isPayrollSubFeatureEnabled(env, actor.companyId, "payroll.salary_loans_enabled"),
    ]);
    return payrollEnabled && (advancesEnabled || loansEnabled);
  }
  return true;
};

export const listTemplates = async (env: Env, actor: AuthActor) => {
  requirePermission(actor, "imports.templates.view");
  const templates = await Promise.all(
    IMPORT_TEMPLATES.map(async (template) => ({
      template,
      enabled: await templateFeatureEnabled(env, actor, template),
    })),
  );
  return {
    data: templates
      .filter(({ template, enabled }) => enabled && permissionService.hasPermission(actor, template.required_permission))
      .map(({ template }) => template),
    generated_at: nowIso(),
  };
};

export const getTemplateDetail = async (env: Env, actor: AuthActor, importType: string) => {
  requirePermission(actor, "imports.templates.view");
  const template = getTemplate(importType);
  if (!template) throw new NotFoundError("Import template could not be found.");
  requirePermission(actor, template.required_permission);
  if (!(await templateFeatureEnabled(env, actor, template))) {
    throw new AppError("This import template is not available while its module is disabled.", "IMPORT_TEMPLATE_MODULE_DISABLED", 403);
  }
  return { data: template, generated_at: nowIso() };
};

export const getTemplateCsv = async (env: Env, actor: AuthActor, importType: string) => {
  const result = await getTemplateDetail(env, actor, importType);
  return { ...result, csv: templateToCsv(result.data) };
};

const validateScalar = (template: ImportTemplate, row: Record<string, string>) => {
  for (const column of template.columns) {
    const value = nonEmpty(row[column.key]);
    if (column.required && !value) return { code: "IMPORT_ROW_VALIDATION_FAILED", message: `${column.label} is required.` };
    if (!value) continue;
    if (column.data_type === "date" && !datePattern.test(value)) return { code: "IMPORT_ROW_VALIDATION_FAILED", message: `${column.label} must be YYYY-MM-DD.` };
    if ((column.data_type === "number" || column.data_type === "money") && !moneyPattern.test(value)) return { code: "IMPORT_ROW_VALIDATION_FAILED", message: `${column.label} must be numeric.` };
    if (column.data_type === "money" && Number(value) < 0) return { code: "IMPORT_ROW_VALIDATION_FAILED", message: `${column.label} cannot be negative.` };
    if (column.data_type === "money" && Number(value) > 100000000) return { code: "IMPORT_ROW_VALIDATION_FAILED", message: `${column.label} is outside the allowed import range.` };
    if (column.data_type === "enum" && column.accepted_values && !column.accepted_values.includes(value)) return { code: "IMPORT_ROW_VALIDATION_FAILED", message: `${column.label} must be one of: ${column.accepted_values.join(", ")}.` };
  }
  if (Object.keys(row).some((key) => unsafeKeys.has(key))) return { code: "IMPORT_ROW_VALIDATION_FAILED", message: "Unsafe metadata or secret fields cannot be imported." };
  return null;
};

const resolveReferences = async (env: Env, actor: AuthActor, template: ImportTemplate, row: Record<string, string>, mode: ImportMode) => {
  const normalized = { ...row };
  const warnings: string[] = [];
  const employeeCode = nonEmpty(row.employee_code);
  if (employeeCode) {
    const employee = await repository.findEmployee(env, actor.companyId, employeeCode);
    if (employee) {
      normalized.employee_id = employee.id;
      normalized.employee_outlet_id = employee.primary_outlet_id ?? "";
      ensureOutletScope(actor, employee.primary_outlet_id);
    } else if (template.import_type !== "employee_master") {
      return { error: { code: "IMPORT_REFERENCE_NOT_FOUND", message: `Employee ${employeeCode} was not found in this company.` }, normalized };
    }
    if (template.import_type === "employee_master") {
      if (mode === "create_only" && employee) return { error: { code: "IMPORT_DUPLICATE_RECORD", message: `Employee code ${employeeCode} already exists.` }, normalized };
      if (mode === "update_only" && !employee) return { error: { code: "IMPORT_REFERENCE_NOT_FOUND", message: `Employee code ${employeeCode} must exist for update_only mode.` }, normalized };
      normalized.existing_employee_id = employee?.id ?? "";
    }
  }

  if (row.outlet) {
    const outlet = await repository.findOutlet(env, actor.companyId, row.outlet);
    if (!outlet) return { error: { code: "IMPORT_REFERENCE_NOT_FOUND", message: `Outlet ${row.outlet} was not found in this company.` }, normalized };
    ensureOutletScope(actor, outlet.id);
    normalized.outlet_id = outlet.id;
  }
  if (row.department) {
    const department = await repository.findDepartment(env, actor.companyId, row.department);
    if (!department) return { error: { code: "IMPORT_REFERENCE_NOT_FOUND", message: `Department ${row.department} was not found in this company.` }, normalized };
    normalized.department_id = department.id;
  }
  if (row.position) {
    const position = await repository.findPosition(env, actor.companyId, row.position);
    if (!position) return { error: { code: "IMPORT_REFERENCE_NOT_FOUND", message: `Position ${row.position} was not found in this company.` }, normalized };
    normalized.position_id = position.id;
  }
  if (row.leave_type_code) {
    const leaveType = await repository.findLeaveType(env, actor.companyId, row.leave_type_code);
    if (!leaveType) return { error: { code: "IMPORT_REFERENCE_NOT_FOUND", message: `Leave type ${row.leave_type_code} was not found in this company.` }, normalized };
    normalized.leave_type_id = leaveType.id;
  }
  if (template.import_type === "employee_documents") {
    const category = await repository.findDocumentCategory(env, actor.companyId, row.document_category);
    if (!category) return { error: { code: "IMPORT_REFERENCE_NOT_FOUND", message: `Document category ${row.document_category} was not found in this company.` }, normalized, warnings };
    if (category.status && category.status !== "active") return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: `Document category ${row.document_category} is not active.` }, normalized, warnings };
    const employeeType = normalized.employee_type || (employeeCode ? (await repository.findEmployee(env, actor.companyId, employeeCode))?.employee_type : "");
    if (employeeType === "foreign" && category.applies_to_foreign_employee !== 1) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: `Document category ${row.document_category} does not apply to foreign employees.` }, normalized, warnings };
    if (employeeType !== "foreign" && category.applies_to_local_employee !== 1) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: `Document category ${row.document_category} does not apply to local employees.` }, normalized, warnings };
    if (category.requires_expiry_date === 1 && !row.expiry_date) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: `Document category ${row.document_category} requires an expiry date.` }, normalized, warnings };
    normalized.document_category_id = category.id;
    normalized.document_category_key = category.category_key;
    normalized.document_category_sensitive = String(category.is_sensitive ?? 1);
    warnings.push("Document metadata imported, file upload still required.");
  }
  if (template.import_type === "salary_compensation" && mode !== "validate_only") {
    requirePermission(actor, "imports.sensitive.manage", "IMPORT_SENSITIVE_PERMISSION_REQUIRED");
  }
  if (template.import_type === "salary_compensation") {
    if (Number(row.base_salary) < 0 || Number(row.base_salary) > 100000000) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: "Base salary is outside the allowed import range." }, normalized, warnings };
    const payroll = await repository.findPayrollRunByMonth(env, actor.companyId, row.effective_date.slice(0, 7));
    if (lockedPayrollStatuses.has(payroll?.status ?? "")) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: "Salary effective date affects a finalized or locked payroll period." }, normalized, warnings };
    const duplicateSalary = normalized.employee_id ? await repository.findSalaryByEmployeeEffective(env, actor.companyId, normalized.employee_id, row.effective_date) : null;
    if (duplicateSalary && mode === "create_only") return { error: { code: "IMPORT_DUPLICATE_RECORD", message: "Salary history already exists for this employee and effective date." }, normalized, warnings };
    normalized.existing_salary_id = duplicateSalary?.id ?? "";
  }
  if (template.import_type === "attendance") {
    if (row.check_in_time && !timePattern.test(row.check_in_time)) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: "Check-in time must be HH:mm, HH:mm:ss, or ISO datetime." }, normalized, warnings };
    if (row.check_out_time && !timePattern.test(row.check_out_time)) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: "Check-out time must be HH:mm, HH:mm:ss, or ISO datetime." }, normalized, warnings };
    const payroll = await repository.findPayrollRunByMonth(env, actor.companyId, row.attendance_date.slice(0, 7));
    if (lockedPayrollStatuses.has(payroll?.status ?? "")) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: "Attendance date is locked because payroll has been finalized." }, normalized, warnings };
    const block = normalized.employee_id ? await repository.findAttendanceImportBlock(env, actor.companyId, normalized.employee_id, row.attendance_date) : null;
    if (block?.payroll_status && ["locked", "finalized", "paid"].includes(block.payroll_status)) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: "Attendance summary is locked for this date." }, normalized, warnings };
    if (block?.correction_applied_id && !permissionService.hasPermission(actor, "attendance.override_manual_corrections")) return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: "A manual correction already exists for this date. Override permission is required." }, normalized, warnings };
    warnings.push("Imported attendance will be marked for summary recalculation/review.");
  }
  if (template.import_type === "employee_master" && row.employee_type === "foreign" && !row.passport_number && !row.work_permit_number) {
    return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: "Foreign employees require passport or work permit details." }, normalized };
  }
  if (template.import_type === "employee_master" && row.employee_type === "local" && !row.national_id && !row.passport_number) {
    return { error: { code: "IMPORT_ROW_VALIDATION_FAILED", message: "Local employees require a national ID or identity reference." }, normalized };
  }
  if (template.import_type === "holidays" && row.code) {
    const duplicate = await repository.findHolidayByCode(env, actor.companyId, row.code).catch(() => null);
    if (duplicate && mode === "create_only") return { error: { code: "IMPORT_DUPLICATE_RECORD", message: `Holiday code ${row.code} already exists.` }, normalized };
    normalized.existing_holiday_id = duplicate?.id ?? "";
  }
  if (template.import_type === "holidays") {
    const sameDate = await repository.findHolidayByDateNameOutlet(env, actor.companyId, row.holiday_name, row.date, normalized.outlet_id || null, normalized.existing_holiday_id || null);
    if (sameDate && mode === "create_only") return { error: { code: "IMPORT_DUPLICATE_RECORD", message: `Active holiday ${row.holiday_name} already exists on ${row.date}.` }, normalized, warnings };
  }
  if (template.import_type === "assets_uniforms" && row.item_type === "asset") {
    const asset = await repository.findAsset(env, actor.companyId, row.item_code);
    if (!asset) return { error: { code: "IMPORT_REFERENCE_NOT_FOUND", message: `Asset ${row.item_code} was not found in this company.` }, normalized };
    normalized.asset_id = asset.id;
  }
  return { normalized, warnings };
};

const buildRows = async (env: Env, actor: AuthActor, template: ImportTemplate, mode: ImportMode, csvContent: string, jobId: string) => {
  const parsed = parseCsv(csvContent);
  validateHeaders(parsed.headers, template);
  const seen = new Set<string>();
  const now = nowIso();
  const rows: ImportJobRow[] = [];
  for (const parsedRow of parsed.rows) {
    const raw = sanitizeRow(parsedRow.row);
    const scalarError = validateScalar(template, raw as Record<string, string>);
    const duplicateKey = JSON.stringify(raw);
    const duplicate = seen.has(duplicateKey);
    seen.add(duplicateKey);
    const resolved = scalarError || duplicate
      ? { normalized: raw as Record<string, string>, error: scalarError ?? { code: "IMPORT_DUPLICATE_ROW", message: "This row duplicates another row in the same import file." } }
      : await resolveReferences(env, actor, template, raw as Record<string, string>, mode);
    rows.push({
      id: createPrefixedId("import_row"),
      company_id: actor.companyId,
      import_job_id: jobId,
      row_number: parsedRow.row_number,
      row_data_json: safeJson(raw),
      normalized_data_json: safeJson(resolved.normalized),
      status: resolved.error ? (resolved.error.code === "IMPORT_DUPLICATE_ROW" ? "duplicate" : "invalid") : "valid",
      error_code: resolved.error?.code ?? null,
      error_message: resolved.error?.message ?? null,
      warnings_json: resolved.error ? safeJson(resolved.warnings ?? []) : safeJson(resolved.warnings ?? []),
      target_entity_type: null,
      target_entity_id: null,
      idempotency_key: `${jobId}:${parsedRow.row_number}:${duplicateKey}`,
      created_at: now,
      updated_at: now,
    });
  }
  return rows;
};

const summaryFromRows = (rows: ImportJobRow[], template: ImportTemplate) => ({
  total_rows: rows.length,
  valid_rows: rows.filter((row) => row.status === "valid").length,
  invalid_rows: rows.filter((row) => row.status === "invalid").length,
  duplicate_rows: rows.filter((row) => row.status === "duplicate").length,
  sensitive_import: template.sensitive,
});

const safeJob = (job: ImportJob) => {
  const { file_storage_key: _fileStorageKey, metadata_json: _metadataJson, ...safe } = job;
  return safe;
};

const maskSensitiveData = (data: Record<string, unknown>, template: ImportTemplate | null | undefined, actor: AuthActor) => {
  if (!template || permissionService.hasPermission(actor, "imports.sensitive.manage")) return data;
  const sensitiveKeys = new Set(template.columns.filter((column) => column.sensitive).map((column) => column.key));
  if (sensitiveKeys.size === 0) return data;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, sensitiveKeys.has(key) && value ? "Restricted" : value]));
};

const safeRow = (row: ImportJobRow, template: ImportTemplate | null | undefined, actor: AuthActor) => {
  const rowData = row.row_data_json ? JSON.parse(row.row_data_json) as Record<string, unknown> : {};
  const normalizedData = row.normalized_data_json ? JSON.parse(row.normalized_data_json) as Record<string, unknown> : {};
  return {
  id: row.id,
  import_job_id: row.import_job_id,
  row_number: row.row_number,
  row_data: maskSensitiveData(rowData, template, actor),
  normalized_data: maskSensitiveData(normalizedData, template, actor),
  status: row.status,
  error_code: row.error_code,
  error_message: row.error_message,
  warnings: row.warnings_json ? JSON.parse(row.warnings_json) : [],
  target_entity_type: row.target_entity_type,
  target_entity_id: row.target_entity_id,
  };
};

export const previewImport = async (env: Env, actor: AuthActor, input: ImportPreviewInput): Promise<ImportValidationResult> => {
  const template = getTemplate(input.import_type);
  if (!template) throw new AppError("This import type is not supported.", "IMPORT_TYPE_UNSUPPORTED", 404);
  if (template.import_type === "attendance") await assertAttendanceImportEnabled(env, actor);
  if (template.import_type === "leave_balances") await assertLeaveImportEnabled(env, actor);
  if (template.import_type === "assets_uniforms") await assertAssetsUniformsImportEnabled(env, actor);
  if (template.import_type === "salary_compensation") await assertPayrollImportEnabled(env, actor, "payroll.salary_processing_enabled");
  if (template.import_type === "advances_loans") await assertPayrollImportEnabled(env, actor);
  requireImportAccess(actor, template, "preview");
  const rows = await buildRows(env, actor, template, input.mode, input.csv_content, "preview_only");
  const now = nowIso();
  const job: ImportJob = {
    id: "preview_only",
    company_id: actor.companyId,
    import_type: input.import_type,
    file_name: input.file_name ?? "preview.csv",
    file_size: input.file_size ?? new TextEncoder().encode(input.csv_content).length,
    file_storage_key: null,
    status: rows.some((row) => row.status === "invalid" || row.status === "duplicate") ? "validation_failed" : "preview_ready",
    mode: input.mode,
    total_rows: rows.length,
    valid_rows: rows.filter((row) => row.status === "valid").length,
    invalid_rows: rows.filter((row) => row.status === "invalid").length,
    created_rows: 0,
    updated_rows: 0,
    skipped_rows: 0,
    failed_rows: 0,
    duplicate_rows: rows.filter((row) => row.status === "duplicate").length,
    requested_by: actor.actorUserId,
    requested_at: now,
    validated_at: now,
    applied_at: null,
    cancelled_at: null,
    failure_code: null,
    failure_message: null,
    idempotency_key: null,
    metadata_json: null,
    created_at: now,
    updated_at: now,
  };
  if (template.sensitive) await audit(env, actor, "import_sensitive_preview", { import_type: template.import_type, total_rows: rows.length, sensitive_import: true });
  return {
    job: safeJob(job) as ImportJob,
    rows,
    summary: summaryFromRows(rows, template),
    sample_rows: rows.slice(0, 5).map((row) => safeRow(row, template, actor).normalized_data),
    errors: rows.filter((row) => row.error_code).map((row) => ({ row_number: row.row_number, error_code: row.error_code!, error_message: row.error_message! })),
  };
};

export const createImportJob = async (env: Env, actor: AuthActor, input: ImportJobCreateInput) => {
  const template = getTemplate(input.import_type);
  if (!template) throw new AppError("This import type is not supported.", "IMPORT_TYPE_UNSUPPORTED", 404);
  if (template.import_type === "attendance") await assertAttendanceImportEnabled(env, actor);
  if (template.import_type === "leave_balances") await assertLeaveImportEnabled(env, actor);
  if (template.import_type === "assets_uniforms") await assertAssetsUniformsImportEnabled(env, actor);
  if (template.import_type === "salary_compensation") await assertPayrollImportEnabled(env, actor, "payroll.salary_processing_enabled");
  if (template.import_type === "advances_loans") await assertPayrollImportEnabled(env, actor);
  requireImportAccess(actor, template, "upload");
  if (!template.supported_modes.includes(input.mode)) throw new AppError("This import mode is not supported for the selected template.", "IMPORT_JOB_INVALID_STATUS", 400);
  const idempotencyKey = input.idempotency_key ?? `${actor.actorUserId}:${input.import_type}:${input.mode}:${input.file_name ?? "csv"}:${input.csv_content.length}`;
  const existing = await repository.findJobByIdempotency(env, actor.companyId, idempotencyKey);
  if (existing) return { job: safeJob(existing), duplicate: true };
  const id = createPrefixedId("import_job");
  const now = nowIso();
  const rows = await buildRows(env, actor, template, input.mode, input.csv_content, id);
  const summary = summaryFromRows(rows, template);
  const job: ImportJob = {
    id,
    company_id: actor.companyId,
    import_type: input.import_type,
    file_name: input.file_name ?? `${input.import_type}.csv`,
    file_size: input.file_size ?? new TextEncoder().encode(input.csv_content).length,
    file_storage_key: null,
    status: summary.invalid_rows > 0 || summary.duplicate_rows > 0 ? "validation_failed" : "preview_ready",
    mode: input.mode,
    total_rows: summary.total_rows,
    valid_rows: summary.valid_rows,
    invalid_rows: summary.invalid_rows,
    created_rows: 0,
    updated_rows: 0,
    skipped_rows: 0,
    failed_rows: 0,
    duplicate_rows: summary.duplicate_rows,
    requested_by: actor.actorUserId,
    requested_at: now,
    validated_at: now,
    applied_at: null,
    cancelled_at: null,
    failure_code: summary.invalid_rows > 0 ? "IMPORT_ROW_VALIDATION_FAILED" : null,
    failure_message: summary.invalid_rows > 0 ? "Some rows failed validation. Fix row errors before applying." : null,
    idempotency_key: idempotencyKey,
    metadata_json: safeJson({ storage_mode: "parsed_rows", preview_mutates_business_data: false, sensitive_import: template.sensitive }),
    created_at: now,
    updated_at: now,
  };
  await repository.insertJob(env, job);
  try {
    await repository.replaceRows(env, actor.companyId, id, rows);
  } catch (error) {
    await repository.markJobFailed(env, actor.companyId, id, "IMPORT_ROW_PERSIST_FAILED", "Import rows could not be stored safely. Please retry with a new job.", nowIso()).catch(() => undefined);
    throw error;
  }
  await audit(env, actor, "import_job_created", { import_job_id: id, import_type: input.import_type, mode: input.mode, total_rows: summary.total_rows, valid_rows: summary.valid_rows, invalid_rows: summary.invalid_rows, sensitive_import: template.sensitive });
  return { job: safeJob(job), summary, sample_rows: rows.slice(0, 5).map((row) => safeRow(row, template, actor)), errors: rows.filter((row) => row.error_code).map((row) => ({ row_number: row.row_number, error_code: row.error_code!, error_message: row.error_message! })), duplicate: false };
};

export const validateImportJob = async (env: Env, actor: AuthActor, id: string) => {
  const job = await requireJob(env, actor, id, "preview");
  const rows = await repository.listRows(env, actor.companyId, id, { page: 1, page_size: 5000 });
  const template = getTemplate(job.import_type);
  if (!template) throw new AppError("This import type is not supported.", "IMPORT_TYPE_UNSUPPORTED", 404);
  if (template.import_type === "attendance") await assertAttendanceImportEnabled(env, actor);
  if (template.import_type === "leave_balances") await assertLeaveImportEnabled(env, actor);
  if (template.import_type === "assets_uniforms") await assertAssetsUniformsImportEnabled(env, actor);
  const summary = summaryFromRows(rows, template);
  await repository.updateJobValidation(env, actor.companyId, id, {
    status: summary.invalid_rows > 0 || summary.duplicate_rows > 0 ? "validation_failed" : "preview_ready",
    totalRows: summary.total_rows,
    validRows: summary.valid_rows,
    invalidRows: summary.invalid_rows,
    duplicateRows: summary.duplicate_rows,
    validatedAt: nowIso(),
    failureCode: summary.invalid_rows > 0 ? "IMPORT_ROW_VALIDATION_FAILED" : null,
    failureMessage: summary.invalid_rows > 0 ? "Some rows failed validation. Fix row errors before applying." : null,
  });
  await audit(env, actor, "import_validation_run", { import_job_id: id, ...summary });
  return { job: safeJob(await repository.getJob(env, actor.companyId, id) ?? job), summary, sample_rows: rows.slice(0, 5).map((row) => safeRow(row, template, actor)), errors: rows.filter((row) => row.error_code).map((row) => ({ row_number: row.row_number, error_code: row.error_code!, error_message: row.error_message! })) };
};

const applyRow = async (env: Env, actor: AuthActor, job: ImportJob, row: ImportJobRow) => {
  const data = parseRowJson(row);
  const now = nowIso();
  const mode = job.mode as ImportMode;
  if (mode === "validate_only") return { status: "skipped" as const, targetType: "validation_only", targetId: row.id };
  if (job.import_type === "employee_master") {
    const existingId = data.existing_employee_id || "";
    const targetId = existingId || stableTargetId("employee", row);
    await repository.upsertEmployee(env, {
      id: targetId,
      companyId: actor.companyId,
      employeeCode: data.employee_code || `IMP-${row.row_number}`,
      fullName: data.full_name,
      employeeType: data.employee_type,
      nationality: data.nationality || null,
      idCardNumber: data.national_id || null,
      passportNumber: data.passport_number || null,
      phone: data.phone || null,
      emergencyContactName: data.emergency_contact_name || null,
      emergencyContactPhone: data.emergency_contact_phone || null,
      emergencyContactRelation: data.emergency_contact_relation || null,
      outletId: data.outlet_id || null,
      departmentId: data.department_id || null,
      positionId: data.position_id || null,
      employmentStatus: data.employment_status || "active",
      joinedAt: data.join_date || null,
      actorId: actor.actorUserId,
      now,
      update: Boolean(existingId) && mode !== "create_only",
    });
    return { status: existingId ? "updated" as const : "created" as const, targetType: "employee", targetId };
  }
  if (job.import_type === "employee_documents") {
    const targetId = stableTargetId("document", row);
    await repository.insertDocumentMetadata(env, { id: targetId, companyId: actor.companyId, employeeId: data.employee_id, documentType: data.document_category_key || data.document_category, documentNumber: data.document_number || null, issueDate: data.issue_date || null, notes: data.notes || "Document metadata imported, file upload still required.", fileKey: `metadata-only/${row.id}`, fileName: `${data.document_category_key || data.document_category || "document"}-metadata-only`, expiryDate: data.expiry_date || null, status: "pending_file", actorId: actor.actorUserId, now });
    return { status: "created" as const, targetType: "employee_document", targetId };
  }
  if (job.import_type === "leave_balances") {
    const targetId = stableTargetId("leave_balance", row);
    await repository.upsertLeaveBalance(env, { id: targetId, txId: stableTargetId("leave_tx", row), companyId: actor.companyId, employeeId: data.employee_id, leaveTypeId: data.leave_type_id, year: Number(data.policy_year), opening: Number(data.opening_balance), carried: Number(data.carried_forward || 0), reason: data.adjustment_reason, actorId: actor.actorUserId, idempotencyKey: row.idempotency_key ?? row.id, now });
    return { status: "updated" as const, targetType: "leave_balance", targetId };
  }
  if (job.import_type === "salary_compensation") {
    const targetId = data.existing_salary_id || stableTargetId("salary", row);
    if (data.existing_salary_id) return { status: "skipped" as const, targetType: "employee_salary_history", targetId };
    await repository.insertSalaryHistory(env, { id: targetId, companyId: actor.companyId, employeeId: data.employee_id, amount: amountMinor(data.base_salary), effectiveFrom: data.effective_date, reason: data.reason, actorId: actor.actorUserId, now });
    return { status: "created" as const, targetType: "employee_salary_history", targetId };
  }
  if (job.import_type === "attendance") {
    const targets: string[] = [];
    for (const [eventType, time] of [["clock_in", data.check_in_time], ["clock_out", data.check_out_time]] as const) {
      if (!time) continue;
      const targetId = stableTargetId("attendance_event", row, `_${eventType}`);
      targets.push(targetId);
      const eventTime = time.includes("T") ? time : `${data.attendance_date}T${time.length === 5 ? `${time}:00+05:00` : `${time}+05:00`}`;
      await repository.insertAttendanceImport(env, { id: targetId, companyId: actor.companyId, employeeId: data.employee_id, outletId: data.employee_outlet_id || data.outlet_id, eventType, eventTime, localId: `import:${row.id}:${eventType}`, now });
    }
    if (targets.length > 0) await repository.markAttendanceSummaryPendingImportRecalculation(env, { id: stableTargetId("attendance_summary", row), companyId: actor.companyId, employeeId: data.employee_id, outletId: data.employee_outlet_id || data.outlet_id, attendanceDate: data.attendance_date, now });
    return { status: targets.length > 0 ? "created" as const : "skipped" as const, targetType: "attendance_event", targetId: targets.join(",") || row.id };
  }
  if (job.import_type === "holidays") {
    const targetId = data.existing_holiday_id || stableTargetId("holiday", row);
    const holidayPayload = {
      id: targetId,
      companyId: actor.companyId,
      name: data.holiday_name,
      code: data.code || null,
      type: data.holiday_type,
      startDate: data.date,
      endDate: data.end_date || null,
      paid: bool(data.paid_holiday, true) ? 1 : 0,
      recurring: bool(data.is_recurring) ? 1 : 0,
      outletId: data.outlet_id || null,
      appliesLocal: bool(data.applies_to_local_employees, true) ? 1 : 0,
      appliesForeign: bool(data.applies_to_foreign_employees, true) ? 1 : 0,
      affectsLeave: bool(data.affects_leave_duration, true) ? 1 : 0,
      affectsAttendance: bool(data.affects_attendance_absence, true) ? 1 : 0,
      affectsLongLeave: bool(data.affects_long_leave_payroll, true) ? 1 : 0,
      notes: data.reason || null,
      actorId: actor.actorUserId,
      now,
    };
    if (data.existing_holiday_id) {
      await repository.updateHolidayImport(env, holidayPayload);
      return { status: "updated" as const, targetType: "holiday", targetId };
    }
    await repository.insertHolidayImport(env, holidayPayload);
    return { status: "created" as const, targetType: "holiday", targetId };
  }
  if (job.import_type === "advances_loans") {
    await assertPayrollImportEnabled(env, actor, data.record_type === "loan" ? "payroll.salary_loans_enabled" : "payroll.advances_enabled");
    const targetId = stableTargetId(data.record_type === "loan" ? "loan" : "advance", row);
    if (data.record_type === "loan") await repository.insertLoan(env, { id: targetId, companyId: actor.companyId, employeeId: data.employee_id, amount: amountMinor(data.amount), installment: amountMinor(data.installment_amount || data.amount), startMonth: data.payroll_month || data.date.slice(0, 7), status: data.status || "pending", actorId: actor.actorUserId, now });
    else await repository.insertAdvance(env, { id: targetId, companyId: actor.companyId, employeeId: data.employee_id, amount: amountMinor(data.amount), paidDate: data.date, deductionMonth: data.payroll_month || data.date.slice(0, 7), status: data.status || "pending", reason: data.reason, actorId: actor.actorUserId, now });
    return { status: "created" as const, targetType: data.record_type === "loan" ? "salary_loan" : "advance_payment", targetId };
  }
  if (job.import_type === "assets_uniforms") {
    const targetId = stableTargetId(data.item_type === "uniform" ? "uniform_issue" : "asset_assignment", row);
    if (data.item_type === "uniform") {
      await repository.insertUniformIssue(env, { id: targetId, companyId: actor.companyId, employeeId: data.employee_id, outletId: data.employee_outlet_id || data.outlet_id || null, uniformType: data.item_code || data.item_name, issuedDate: data.assigned_date, status: data.status || "issued", actorId: actor.actorUserId, now });
      return { status: "created" as const, targetType: "uniform_issue", targetId };
    }
    await repository.insertAssetAssignment(env, { id: targetId, companyId: actor.companyId, assetId: data.asset_id, employeeId: data.employee_id, outletId: data.employee_outlet_id || data.outlet_id || null, issuedDate: data.assigned_date, condition: data.condition || null, status: data.status || "issued", actorId: actor.actorUserId, now });
    return { status: "created" as const, targetType: "asset_assignment", targetId };
  }
  return { status: "skipped" as const, targetType: String(job.import_type), targetId: row.id };
};

export const applyImportJob = async (env: Env, actor: AuthActor, id: string) => {
  const job = await requireJob(env, actor, id, "apply");
  if (job.import_type === "attendance") await assertAttendanceImportEnabled(env, actor);
  if (job.import_type === "leave_balances") await assertLeaveImportEnabled(env, actor);
  if (job.import_type === "assets_uniforms") await assertAssetsUniformsImportEnabled(env, actor);
  if (job.import_type === "salary_compensation") await assertPayrollImportEnabled(env, actor, "payroll.salary_processing_enabled");
  if (job.import_type === "advances_loans") await assertPayrollImportEnabled(env, actor);
  if (job.status === "completed") return { job: safeJob(job), summary: { created_rows: job.created_rows, updated_rows: job.updated_rows, skipped_rows: job.skipped_rows, failed_rows: job.failed_rows }, already_applied: true };
  if (!["preview_ready", "partially_completed"].includes(job.status)) throw new AppError("Only preview-ready imports can be applied.", "IMPORT_APPLY_BLOCKED", 409);
  const rows = await repository.listValidRowsForApply(env, actor.companyId, id);
  if (job.status === "partially_completed" && rows.length === 0) {
    return { job: safeJob(job), summary: { created_rows: job.created_rows, updated_rows: job.updated_rows, skipped_rows: job.skipped_rows, failed_rows: job.failed_rows }, already_applied: true, partial_retry_exhausted: true };
  }
  const claimed = await repository.claimApplying(env, actor.companyId, id, nowIso());
  if (!claimed) throw new AppError("This import job is already being applied or cannot be applied.", "IMPORT_JOB_INVALID_STATUS", 409);
  let createdRows = 0;
  let updatedRows = 0;
  let skippedRows = 0;
  let failedRows = 0;
  for (const row of rows) {
    try {
      const result = await applyRow(env, actor, job, row);
      if (result.status === "created") createdRows += 1;
      else if (result.status === "updated") updatedRows += 1;
      else skippedRows += 1;
      await repository.markRowApplied(env, actor.companyId, row.id, result.targetType, result.targetId, nowIso());
    } catch (error) {
      failedRows += 1;
      await repository.markRowFailed(env, actor.companyId, row.id, "IMPORT_APPLY_FAILED", error instanceof Error ? error.message.slice(0, 300) : "Row could not be applied.", nowIso());
    }
  }
  const status = failedRows > 0 ? "partially_completed" : "completed";
  await repository.completeJob(env, actor.companyId, id, { status, createdRows, updatedRows, skippedRows, failedRows, appliedAt: nowIso(), failureCode: failedRows > 0 ? "IMPORT_ROW_APPLY_FAILED" : null, failureMessage: failedRows > 0 ? "Some rows failed during apply. Review row errors." : null });
  await audit(env, actor, "import_applied", { import_job_id: id, import_type: job.import_type, mode: job.mode, created_rows: createdRows, updated_rows: updatedRows, skipped_rows: skippedRows, failed_rows: failedRows });
  return { job: safeJob(await repository.getJob(env, actor.companyId, id) ?? job), summary: { created_rows: createdRows, updated_rows: updatedRows, skipped_rows: skippedRows, failed_rows: failedRows } };
};

type JobAction = "view" | "preview" | "apply" | "cancel" | "errors";
const requireJob = async (env: Env, actor: AuthActor, id: string, action: JobAction) => {
  const job = await repository.getJob(env, actor.companyId, id);
  if (!job) throw new NotFoundError("Import job could not be found.");
  const isAdmin = permissionService.hasAnyPermission(actor, ["imports.history.view", "imports.apply"]);
  if (job.requested_by !== actor.actorUserId && !actor.isAdmin && !actor.isSuperAdmin && !isAdmin) {
    throw new PermissionError("You do not have permission to access this import job.", "IMPORT_PERMISSION_DENIED");
  }
  const template = getTemplate(job.import_type);
  if (!template) throw new AppError("This import type is not supported.", "IMPORT_TYPE_UNSUPPORTED", 404);
  if (action === "view") requirePermission(actor, "imports.view");
  if (action === "preview") requireImportAccess(actor, template, "preview");
  if (action === "apply") requireImportAccess(actor, template, "apply");
  if (action === "cancel") requirePermission(actor, "imports.cancel");
  if (action === "errors") requirePermission(actor, "imports.errors.view");
  return job;
};

export const getImportJob = async (env: Env, actor: AuthActor, id: string) => ({ job: safeJob(await requireJob(env, actor, id, "view")) });

export const listImportJobs = async (env: Env, actor: AuthActor, filters: ImportListFilters) => {
  requirePermission(actor, "imports.view");
  const isAdmin = permissionService.hasPermission(actor, "imports.history.view") || actor.isAdmin || actor.isSuperAdmin;
  const [total, rows] = await Promise.all([
    repository.countJobs(env, actor.companyId, filters, isAdmin, actor.actorUserId),
    repository.listJobs(env, actor.companyId, filters, isAdmin, actor.actorUserId),
  ]);
  const pagination: PaginationMeta = { page: filters.page, page_size: filters.page_size, total, total_pages: total === 0 ? 0 : Math.ceil(total / filters.page_size) };
  return { data: rows.map(safeJob), filters, pagination, generated_at: nowIso() };
};

export const listImportRows = async (env: Env, actor: AuthActor, id: string, filters: ImportRowsFilters) => {
  await requireJob(env, actor, id, "errors");
  const [total, rows] = await Promise.all([
    repository.countRows(env, actor.companyId, id, filters),
    repository.listRows(env, actor.companyId, id, filters),
  ]);
  const pagination: PaginationMeta = { page: filters.page, page_size: filters.page_size, total, total_pages: total === 0 ? 0 : Math.ceil(total / filters.page_size) };
  const template = getTemplate((await repository.getJob(env, actor.companyId, id))?.import_type ?? "");
  return { data: rows.map((row) => safeRow(row, template, actor)), filters, pagination, generated_at: nowIso() };
};

export const listImportErrors = (env: Env, actor: AuthActor, id: string, filters: ImportRowsFilters) =>
  listImportRows(env, actor, id, { ...filters, status: filters.status ?? "invalid" });

export const cancelImportJob = async (env: Env, actor: AuthActor, id: string) => {
  const job = await requireJob(env, actor, id, "cancel");
  if (!["uploaded", "validating", "preview_ready", "validation_failed"].includes(job.status)) {
    throw new AppError("This import job can no longer be cancelled.", "IMPORT_JOB_INVALID_STATUS", 409);
  }
  const cancelled = await repository.cancelJob(env, actor.companyId, id, nowIso());
  if (!cancelled) throw new AppError("This import job can no longer be cancelled.", "IMPORT_JOB_INVALID_STATUS", 409);
  await audit(env, actor, "import_cancelled", { import_job_id: id, import_type: job.import_type });
  return getImportJob(env, actor, id);
};
