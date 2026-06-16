import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import { AppError, NotFoundError, ValidationError } from "../../utils/errors";
import { parseImportWorkbook, validateImportContent } from "./import-validation.service";
import * as repository from "./import-export.repository";
import type { ImportUploadInput, ListFilters } from "./import-export.types";

const decodeBase64 = (value: string) => {
  const normalized = value.replace(/\s/g, "");
  if (!normalized) throw new ValidationError("Please attach an import file before uploading.");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new ValidationError("The uploaded import file content is invalid.");
  }
  let binary = "";
  try {
    binary = atob(normalized);
  } catch {
    throw new ValidationError("The uploaded import file content is invalid.");
  }
  if (binary.length === 0) throw new ValidationError("The uploaded import file is empty.");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (bytes.byteLength === 0) throw new ValidationError("The uploaded import file is empty.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new ValidationError("The uploaded file is not a valid Excel .xlsx workbook.");
  }
  return bytes;
};

const audit = async (env: Env, context: AuthActor, action: string, entityId: string, reason?: string) => {
  const result = await auditService.createAuditLog(env, {
    companyId: context.companyId,
    module: "import_export",
    action,
    severity: "warning",
    entityType: "import_batch",
    entityId,
    actorId: context.actorUserId,
    reason,
  });
  if (!result.created) throw new AppError("This action could not be completed because audit logging failed.", "AUDIT_LOG_REQUIRED", 500);
};

export const uploadImport = async (env: Env, context: AuthActor, input: ImportUploadInput) => {
  const jobId = crypto.randomUUID();
  const fileKey = `imports/${context.companyId}/${jobId}-${input.file_name}`;
  const content = decodeBase64(input.content_base64);
  await env.BACKUP_BUCKET.put(fileKey, content, { httpMetadata: { contentType: input.mime_type } });
  await repository.createImportBatch(env, jobId, context.companyId, context.actorUserId, input, fileKey);
  await audit(env, context, "import_file_uploaded", jobId, input.reason);
  return { import_job: await getImport(env, context, jobId) };
};

export const listImports = (env: Env, context: AuthActor, filters: ListFilters) => repository.listImportBatches(env, context.companyId, filters);

export const getImport = async (env: Env, context: AuthActor, id: string) => {
  const job = await repository.findImportBatch(env, context.companyId, id);
  if (!job) throw new NotFoundError("Import job not found.");
  const { file_key: _fileKey, ...safe } = job;
  return safe;
};

export const validateImport = async (env: Env, context: AuthActor, id: string) => {
  const job = await repository.findImportBatch(env, context.companyId, id);
  if (!job) throw new NotFoundError("Import job not found.");
  const object = job.file_key ? await env.BACKUP_BUCKET.get(job.file_key) : null;
  if (!object) throw new AppError("Import file is not ready yet.", "IMPORT_FILE_NOT_READY", 409);
  const content = new Uint8Array(await object.arrayBuffer());
  const result = await validateImportContent(content, object.httpMetadata?.contentType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", job.import_type);
  await repository.updateImportValidation(env, context.companyId, id, { total_rows: result.total_rows, valid_rows: result.valid_rows, invalid_rows: result.invalid_rows });
  await audit(env, context, "import_validated", id);
  return result;
};

export const applyImport = async (env: Env, context: AuthActor, id: string, reason: string) => {
  const job = await repository.findImportBatch(env, context.companyId, id);
  if (!job) throw new NotFoundError("Import job not found.");
  if (job.status !== "validated") throw new AppError("This import file has validation errors.", "IMPORT_VALIDATION_REQUIRED", 409);
  if (job.import_type !== "employees") {
    throw new AppError("This import template is not available for Excel apply yet.", "UNSUPPORTED_IMPORT_TEMPLATE", 400);
  }
  const object = job.file_key ? await env.BACKUP_BUCKET.get(job.file_key) : null;
  if (!object) throw new AppError("Import file is not ready yet.", "IMPORT_FILE_NOT_READY", 409);
  const parsed = await parseImportWorkbook(new Uint8Array(await object.arrayBuffer()), object.httpMetadata?.contentType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", job.import_type);
  if (parsed.invalid_rows > 0) {
    await repository.updateImportValidation(env, context.companyId, id, { total_rows: parsed.total_rows, valid_rows: parsed.valid_rows, invalid_rows: parsed.invalid_rows });
    throw new AppError("This import file has validation errors. Please fix the workbook and upload it again.", "IMPORT_VALIDATION_REQUIRED", 409);
  }

  const seenCodes = new Set<string>();
  const rowsToInsert: Array<Record<string, string>> = [];
  const errors: Array<{ row: number; message: string }> = [];
  for (const [index, row] of parsed.rows.entries()) {
    const employeeCode = (row.employee_no || row.employee_code || "").trim();
    if (!employeeCode || !row.full_name?.trim()) {
      errors.push({ row: index + 2, message: "Employee number and full name are required." });
      continue;
    }
    if (seenCodes.has(employeeCode)) {
      errors.push({ row: index + 2, message: `Duplicate employee number ${employeeCode} in workbook.` });
      continue;
    }
    seenCodes.add(employeeCode);
    const existing = await repository.findEmployeeByCode(env, context.companyId, employeeCode);
    if (existing) {
      errors.push({ row: index + 2, message: `Employee ${employeeCode} already exists.` });
      continue;
    }
    rowsToInsert.push({ ...row, employee_no: employeeCode, full_name: row.full_name.trim() });
  }

  await repository.insertImportedEmployees(env, context.companyId, context.actorUserId, rowsToInsert);
  await repository.markImportApplied(env, context.companyId, id, { total: parsed.total_rows, applied: rowsToInsert.length, failed: errors.length });
  await audit(env, context, "import_applied", id, reason);
  return { import_job_id: id, applied: true, applied_rows: rowsToInsert.length, failed_rows: errors.length, errors };
};

export const cancelImport = async (env: Env, context: AuthActor, id: string, reason: string) => {
  await audit(env, context, "import_cancelled", id, reason);
  return { import_job_id: id, status: "cancelled" };
};
