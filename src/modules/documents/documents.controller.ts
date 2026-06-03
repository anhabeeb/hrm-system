import type { Context } from "hono";

import * as service from "./documents.service";
import {
  validateCategoryFilters,
  validateCategoryInput,
  validateCategoryUpdate,
  validateDocumentDelete,
  validateDocumentFilters,
  validateDocumentUpdate,
  validateDocumentUpload,
} from "./documents.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const id = (c: Context<AppContext>, name = "id") => {
  const value = c.req.param(name);
  if (!value) throw new ValidationError("Document is required.");
  return value;
};
const query = (c: Context<AppContext>) => ({
  employee_id: c.req.query("employee_id"),
  outlet_id: c.req.query("outlet_id"),
  document_type: c.req.query("document_type"),
  status: c.req.query("status"),
  is_sensitive: c.req.query("is_sensitive"),
  expiring_before: c.req.query("expiring_before"),
  applies_to_foreign_employee: c.req.query("applies_to_foreign_employee"),
  applies_to_local_employee: c.req.query("applies_to_local_employee"),
  page: c.req.query("page"),
  page_size: c.req.query("page_size"),
});

export const listDocuments = async (c: Context<AppContext>) => {
  const result = await service.listDocuments(c.env, actor(c), validateDocumentFilters(query(c)));
  return paginated(result.rows, result.pagination, "Documents loaded successfully.", { requestId: c.get("requestId") });
};
export const getDocument = async (c: Context<AppContext>) =>
  ok(await service.getDocument(c.env, actor(c), id(c)), "Document loaded successfully.", { requestId: c.get("requestId") });
export const uploadDocument = async (c: Context<AppContext>) =>
  created(await service.uploadDocument(c.env, actor(c), validateDocumentUpload(await body(c))), "Document uploaded successfully.", { requestId: c.get("requestId") });
export const updateDocument = async (c: Context<AppContext>) =>
  ok(await service.updateDocument(c.env, actor(c), id(c), validateDocumentUpdate(await body(c))), "Document updated successfully.", { requestId: c.get("requestId") });
export const deleteDocument = async (c: Context<AppContext>) =>
  ok(await service.deleteDocument(c.env, actor(c), id(c), validateDocumentDelete(await body(c))), "Document deleted successfully.", { requestId: c.get("requestId") });
export const downloadDocument = async (c: Context<AppContext>) =>
  {
    const result = await service.downloadDocument(c.env, actor(c), id(c));
    const fileName = String(result.file_name ?? "document").replace(/["\\\r\n]/g, "_");
    const headers = new Headers();
    headers.set("Content-Type", result.mime_type ?? result.object.httpMetadata?.contentType ?? "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${fileName}"`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("x-request-id", c.get("requestId"));
    return new Response(result.object.body, { status: 200, headers });
  };
export const expiringDocuments = async (c: Context<AppContext>) => {
  const result = await service.expiringDocuments(c.env, actor(c), validateDocumentFilters(query(c)));
  return paginated(result.rows, result.pagination, "Expiring documents loaded successfully.", { requestId: c.get("requestId") });
};
export const missingDocuments = async (c: Context<AppContext>) => {
  const result = await service.missingDocuments(c.env, actor(c), validateDocumentFilters(query(c)));
  return paginated(result.rows, result.pagination, "Missing documents loaded successfully.", { requestId: c.get("requestId") });
};
export const listCategories = async (c: Context<AppContext>) => {
  const result = await service.listCategories(c.env, actor(c), validateCategoryFilters(query(c)));
  return paginated(result.rows, result.pagination, "Document categories loaded successfully.", { requestId: c.get("requestId") });
};
export const createCategory = async (c: Context<AppContext>) =>
  created(await service.createCategory(c.env, actor(c), validateCategoryInput(await body(c))), "Document category created successfully.", { requestId: c.get("requestId") });
export const updateCategory = async (c: Context<AppContext>) =>
  ok(await service.updateCategory(c.env, actor(c), id(c), validateCategoryUpdate(await body(c))), "Document category updated successfully.", { requestId: c.get("requestId") });
