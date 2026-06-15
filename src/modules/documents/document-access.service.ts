import * as repository from "./documents.repository";
import * as permissionService from "../../services/permission.service";
import type { AuthActor } from "../../types/api.types";
import { AppError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const activeEmployee = (employee: any) =>
  Boolean(employee && !employee.deleted_at && !employee.archived_at && !["inactive", "archived", "deleted", "terminated", "resigned"].includes(employee.employment_status ?? "active"));

export const canViewEmployeeDocument = async (env: Env, context: AuthActor, document: any, action: "view" | "download" | "edit" | "delete") => {
  const actorEmployee = await repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);
  const isOwnDocument = activeEmployee(actorEmployee) && actorEmployee.id === document.employee_id;
  if (permissionService.isSuperAdmin(context)) return true;
  // Own-document policy: linked employees may view/download their own document records
  // with self.documents.view, including sensitive documents. Coworker sensitive access
  // still requires the dedicated sensitive-document permission below.
  if (isOwnDocument && ["view", "download"].includes(action) && permissionService.hasPermission(context, "self.documents.view")) return true;
  if (document.is_sensitive === 1 && !permissionService.hasPermission(context, "documents.view_sensitive")) {
    throw new AppError("This document is sensitive. You do not have permission to access it.", "DOCUMENT_ACCESS_DENIED", 403);
  }
  if (!permissionService.hasOutletAccess(context, document.outlet_id)) {
    throw new OutletAccessError("You do not have access to this document.");
  }
  if (action === "view" && permissionService.hasAnyPermission(context, ["documents.view", "documentKyc.requests.view"])) return true;
  if (action === "download" && permissionService.hasAnyPermission(context, ["documents.download", "employeeDocuments.download"])) return true;
  if (["edit", "delete"].includes(action) && permissionService.hasPermission(context, action === "edit" ? "documents.edit" : "documents.delete")) return true;
  if (document.source_kyc_request_id && ["view", "download"].includes(action) && permissionService.hasAnyPermission(context, ["documentKyc.requests.review", "documentKyc.requests.finalApprove", "documentKyc.requests.apply", "approvals.operationExecutor.view"])) return true;
  if (action === "download") {
    throw new AppError("You do not have permission to download this document.", "PERMISSION_DENIED", 403);
  }
  throw new AppError("You do not have permission to access this document.", "PERMISSION_DENIED", 403);
};

export const canDownloadEmployeeDocument = (env: Env, context: AuthActor, document: any) =>
  canViewEmployeeDocument(env, context, document, "download");

export const assertDocumentAccess = canViewEmployeeDocument;

export const createDocumentAccessLog = (env: Env, context: AuthActor, document: any, action: string) =>
  repository.createAccessLog(env, {
    id: createPrefixedId("doc_access"),
    companyId: context.companyId,
    employeeId: document.employee_id,
    documentId: document.id,
    userId: context.actorUserId,
    action,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  }).catch((error) => {
    console.warn("Document access log could not be recorded", {
      action,
      documentId: document.id,
      requestId: context.requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });
