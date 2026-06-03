import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import { AppError, NotFoundError, ValidationError } from "../../utils/errors";
import { validateImportContent } from "./import-validation.service";
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
  return new TextDecoder().decode(bytes);
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
  const content = await object.text();
  const result = validateImportContent(content, object.httpMetadata?.contentType ?? "text/csv");
  await repository.updateImportValidation(env, context.companyId, id, { total_rows: result.total_rows, valid_rows: result.valid_rows, invalid_rows: result.invalid_rows });
  await audit(env, context, "import_validated", id);
  return result;
};

export const applyImport = async (env: Env, context: AuthActor, id: string, reason: string) => {
  const job = await repository.findImportBatch(env, context.companyId, id);
  if (!job) throw new NotFoundError("Import job not found.");
  if (job.status !== "validated") throw new AppError("This import file has validation errors.", "IMPORT_VALIDATION_REQUIRED", 409);
  await audit(env, context, "import_applied", id, reason);
  return { import_job_id: id, applied: false, note: "Import apply is a safe placeholder and does not modify business data yet." };
};

export const cancelImport = async (env: Env, context: AuthActor, id: string, reason: string) => {
  await audit(env, context, "import_cancelled", id, reason);
  return { import_job_id: id, status: "cancelled" };
};
