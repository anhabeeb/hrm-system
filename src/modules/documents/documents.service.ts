import { DOCUMENT_AUDIT_ACTIONS } from "./documents.constants";
import * as accessService from "./document-access.service";
import * as expiryService from "./document-expiry.service";
import * as storageService from "./document-storage.service";
import * as repository from "./documents.repository";
import type {
  DocumentCategoryFilters,
  DocumentCategoryInput,
  DocumentDeleteInput,
  DocumentFilters,
  DocumentListResult,
  DocumentUpdateInput,
  DocumentUploadInput,
} from "./documents.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import { broadcastEvent } from "../../services/realtime.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({ page, page_size: pageSize, total, total_pages: total === 0 ? 0 : Math.ceil(total / pageSize) });
const scope = (context: AuthActor) => ({ isSuperAdmin: permissionService.isSuperAdmin(context), outletIds: context.outletIds });
const includeSensitive = (context: AuthActor) => permissionService.hasPermission(context, "documents.view_sensitive");
const sanitize = (document: any) => {
  if (!document) return document;
  const { file_key: _fileKey, ...safe } = document;
  return safe;
};
const audit = async (
  env: Env,
  context: AuthActor,
  input: { action: string; entityType: string; entityId: string; employeeId?: string | null; outletId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: "documents",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId ?? undefined,
    actorId: context.actorUserId,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};
const ensureEmployeeAccess = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee || employee.deleted_at) throw new NotFoundError("The requested employee could not be found.");
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) throw new OutletAccessError("You do not have access to this employee's outlet.");
  return employee;
};
const ensureDocument = async (env: Env, context: AuthActor, id: string, action: "view" | "download" | "edit" | "delete" = "view") => {
  const document = await repository.findDocumentById(env, context.companyId, id);
  if (!document) throw new NotFoundError("Document not found.");
  accessService.assertDocumentAccess(context, document, action);
  return document;
};

export const listDocuments = async (env: Env, context: AuthActor, filters: DocumentFilters): Promise<DocumentListResult<any>> => {
  const total = await repository.countDocuments(env, context.companyId, filters, scope(context));
  return {
    rows: (await repository.listDocuments(env, context.companyId, filters, scope(context), includeSensitive(context))).map(sanitize),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getDocument = async (env: Env, context: AuthActor, id: string) => {
  const document = await ensureDocument(env, context, id, "view");
  await accessService.createDocumentAccessLog(env, context, document, "view");
  if (document.is_sensitive === 1) {
    await audit(env, context, { action: DOCUMENT_AUDIT_ACTIONS.viewed, entityType: "employee_document", entityId: id, employeeId: document.employee_id, outletId: document.outlet_id });
  }
  return { document: sanitize(document) };
};

export const uploadDocument = async (env: Env, context: AuthActor, input: DocumentUploadInput) => {
  const employee = await ensureEmployeeAccess(env, context, input.employee_id);
  const id = createPrefixedId("doc");
  let fileKey: string;
  try {
    fileKey = await storageService.storeDocument(env, context.companyId, input);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_base64") {
      throw new AppError("The uploaded document content is invalid.", "DOCUMENT_CONTENT_INVALID", 400);
    }
    if (error instanceof Error && error.message === "empty_file") {
      throw new AppError("The uploaded document is empty.", "DOCUMENT_EMPTY", 400);
    }
    throw error;
  }
  await repository.createDocument(env, {
    id,
    companyId: context.companyId,
    employeeId: input.employee_id,
    documentType: input.document_type,
    fileKey,
    fileName: input.file_name,
    mimeType: input.mime_type,
    expiryDate: input.expiry_date,
    isSensitive: input.is_sensitive !== false,
    uploadedBy: context.actorUserId,
  });
  const document = await repository.findDocumentById(env, context.companyId, id);
  await accessService.createDocumentAccessLog(env, context, document, "upload");
  await audit(env, context, { action: DOCUMENT_AUDIT_ACTIONS.uploaded, entityType: "employee_document", entityId: id, employeeId: input.employee_id, outletId: employee.primary_outlet_id, newValue: sanitize(document) });
  await broadcastEvent(env, { roomName: `company:${context.companyId}`, type: "documents.uploaded", payload: { document_id: id, employee_id: input.employee_id }, triggeredBy: context.actorUserId }).catch(() => undefined);
  return { document: sanitize(document) };
};

export const updateDocument = async (env: Env, context: AuthActor, id: string, input: DocumentUpdateInput) => {
  const existing = await ensureDocument(env, context, id, "edit");
  const sensitiveChange =
    (input.document_type !== undefined && input.document_type !== existing.document_type) ||
    (input.expiry_date !== undefined && input.expiry_date !== existing.expiry_date) ||
    (input.status !== undefined && input.status !== existing.status) ||
    (input.is_sensitive !== undefined && (input.is_sensitive ? 1 : 0) !== existing.is_sensitive);
  if (sensitiveChange && (!input.reason || input.reason.length < 3)) {
    throw new AppError("A reason is required for this action.", "REASON_REQUIRED", 400);
  }
  await repository.updateDocument(env, context.companyId, id, input);
  const updated = await repository.findDocumentById(env, context.companyId, id);
  await accessService.createDocumentAccessLog(env, context, existing, "update");
  await audit(env, context, { action: DOCUMENT_AUDIT_ACTIONS.updated, entityType: "employee_document", entityId: id, employeeId: existing.employee_id, outletId: existing.outlet_id, oldValue: sanitize(existing), newValue: sanitize(updated), reason: input.reason });
  await broadcastEvent(env, { roomName: `company:${context.companyId}`, type: "documents.updated", payload: { document_id: id }, triggeredBy: context.actorUserId }).catch(() => undefined);
  return { document: sanitize(updated) };
};

export const deleteDocument = async (env: Env, context: AuthActor, id: string, input: DocumentDeleteInput) => {
  const existing = await ensureDocument(env, context, id, "delete");
  await repository.softDeleteDocument(env, context.companyId, id);
  await accessService.createDocumentAccessLog(env, context, existing, "delete");
  await audit(env, context, { action: DOCUMENT_AUDIT_ACTIONS.deleted, entityType: "employee_document", entityId: id, employeeId: existing.employee_id, outletId: existing.outlet_id, oldValue: sanitize(existing), reason: input.reason });
  await broadcastEvent(env, { roomName: `company:${context.companyId}`, type: "documents.deleted", payload: { document_id: id }, triggeredBy: context.actorUserId }).catch(() => undefined);
  return { deleted: true };
};

export const downloadDocument = async (env: Env, context: AuthActor, id: string) => {
  const document = await ensureDocument(env, context, id, "download");
  const object = await storageService.loadDocument(env, document.file_key);
  if (!object) throw new NotFoundError("Document file not found.");
  await accessService.createDocumentAccessLog(env, context, document, "download");
  await audit(env, context, { action: DOCUMENT_AUDIT_ACTIONS.downloaded, entityType: "employee_document", entityId: id, employeeId: document.employee_id, outletId: document.outlet_id });
  return {
    object,
    file_name: document.file_name,
    mime_type: document.mime_type,
  };
};

export const expiringDocuments = async (env: Env, context: AuthActor, filters: DocumentFilters): Promise<DocumentListResult<any>> => {
  const total = await expiryService.countExpiringDocuments(env, context.companyId, filters, scope(context));
  return {
    rows: (await expiryService.listExpiringDocuments(env, context.companyId, filters, scope(context), includeSensitive(context))).map(sanitize),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const missingDocuments = async (env: Env, context: AuthActor, filters: DocumentFilters): Promise<DocumentListResult<any>> => {
  const allRows = await expiryService.getMissingDocuments(env, context.companyId, scope(context), filters.outlet_id);
  const filtered = filters.employee_id ? allRows.filter((row) => row.employee_id === filters.employee_id) : allRows;
  const offset = (filters.page - 1) * filters.page_size;
  return {
    rows: filtered.slice(offset, offset + filters.page_size),
    pagination: pagination(filters.page, filters.page_size, filtered.length),
  };
};

export const listCategories = async (env: Env, context: AuthActor, filters: DocumentCategoryFilters): Promise<DocumentListResult<any>> => {
  const total = await repository.countCategories(env, context.companyId, filters);
  return {
    rows: await repository.listCategories(env, context.companyId, filters),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};
export const createCategory = async (env: Env, context: AuthActor, input: DocumentCategoryInput) => {
  const existing = await repository.findCategoryByKey(env, context.companyId, input.category_key);
  if (existing) throw new AppError("This document category key is already in use.", "DOCUMENT_CATEGORY_EXISTS", 409);
  const id = createPrefixedId("doc_cat");
  await repository.createCategory(env, id, context.companyId, input);
  const category = await repository.findCategoryById(env, context.companyId, id);
  await audit(env, context, { action: DOCUMENT_AUDIT_ACTIONS.categoryCreated, entityType: "document_category", entityId: id, newValue: category });
  return { category };
};
export const updateCategory = async (env: Env, context: AuthActor, id: string, input: Partial<DocumentCategoryInput>) => {
  const existing = await repository.findCategoryById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Document category not found.");
  if (input.category_key) {
    const duplicate = await repository.findCategoryByKey(env, context.companyId, input.category_key);
    if (duplicate && duplicate.id !== id) throw new AppError("This document category key is already in use.", "DOCUMENT_CATEGORY_EXISTS", 409);
  }
  await repository.updateCategory(env, context.companyId, id, input);
  const updated = await repository.findCategoryById(env, context.companyId, id);
  await audit(env, context, { action: DOCUMENT_AUDIT_ACTIONS.categoryUpdated, entityType: "document_category", entityId: id, oldValue: existing, newValue: updated, reason: input.reason });
  return { category: updated };
};
