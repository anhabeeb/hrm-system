import * as repository from "./documents.repository";
import * as permissionService from "../../services/permission.service";
import type { AuthActor } from "../../types/api.types";
import { AppError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

export const assertDocumentAccess = (context: AuthActor, document: any, action: "view" | "download" | "edit" | "delete") => {
  if (!permissionService.hasOutletAccess(context, document.outlet_id)) {
    throw new OutletAccessError("You do not have access to this document.");
  }
  if (document.is_sensitive === 1 && !permissionService.hasPermission(context, "documents.view_sensitive")) {
    throw new AppError("This document is sensitive. You do not have permission to access it.", "DOCUMENT_ACCESS_DENIED", 403);
  }
  if (action === "download" && !permissionService.hasPermission(context, "documents.download")) {
    throw new AppError("You do not have permission to download this document.", "PERMISSION_DENIED", 403);
  }
};

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
