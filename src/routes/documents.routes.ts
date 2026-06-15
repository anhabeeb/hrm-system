import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import { requireReason } from "../middleware/reason-required.middleware";
import * as controller from "../modules/documents/documents.controller";
import type { AppContext } from "../types/api.types";

const documentsRoutes = new Hono<AppContext>();

documentsRoutes.use("*", authMiddleware);
documentsRoutes.use("*", requireFeature("documents"));

documentsRoutes.get("/", requireAnyPermission(["documents.view", "self.documents.view"]), controller.listDocuments);
documentsRoutes.post("/", requirePermission("documents.upload"), controller.uploadDocument);
documentsRoutes.post("/upload", requirePermission("documents.upload"), controller.uploadDocument);
documentsRoutes.get("/expiring", requirePermission("documents.view_expiring"), controller.expiringDocuments);
documentsRoutes.get("/missing", requirePermission("documents.view_missing"), controller.missingDocuments);
documentsRoutes.get("/categories", requireAnyPermission(["documents_settings.manage", "documents.view"]), controller.listCategories);
documentsRoutes.post("/categories", requirePermission("documents_settings.manage"), controller.createCategory);
documentsRoutes.patch("/categories/:id", requirePermission("documents_settings.manage"), controller.updateCategory);
documentsRoutes.get("/kyc-requests", requireAnyPermission(["documentKyc.requests.view", "documentKyc.requests.create", "documentKyc.requests.review", "documentKyc.requests.approve", "documentKyc.requests.finalApprove", "documentKyc.requests.apply", "documentKyc.requests.audit.view", "approvals.operationExecutor.view", "approvals.operationExecutor.apply", "approvals.requests.view", "documents.view"]), controller.listKycRequests);
documentsRoutes.post("/kyc-requests", requireAnyPermission(["documentKyc.requests.create", "documentKyc.requests.createForOthers"]), requireReason(), controller.createKycRequest);
documentsRoutes.get("/kyc-requests/:requestId", requireAnyPermission(["documentKyc.requests.view", "documentKyc.requests.create", "documentKyc.requests.review", "documentKyc.requests.approve", "documentKyc.requests.finalApprove", "documentKyc.requests.apply", "documentKyc.requests.audit.view", "approvals.operationExecutor.view", "approvals.operationExecutor.apply", "approvals.requests.view", "documents.view"]), controller.getKycRequest);
documentsRoutes.post("/kyc-requests/:requestId/submit", requireAnyPermission(["documentKyc.requests.submit", "documentKyc.requests.create", "documentKyc.requests.createForOthers"]), controller.submitKycRequest);
documentsRoutes.post("/kyc-requests/:requestId/approve", requireAnyPermission(["documentKyc.requests.review", "documentKyc.requests.approve", "documentKyc.requests.finalApprove", "approvals.operationOwner.approve", "approvals.operationFinal.approve", "approvals.department.approve", "approvals.hrFinal.approve"]), requireReason(), controller.approveKycRequest);
documentsRoutes.post("/kyc-requests/:requestId/reject", requireAnyPermission(["documentKyc.requests.reject", "approvals.operationOwner.reject", "approvals.operationFinal.reject", "approvals.department.reject", "approvals.hrFinal.reject"]), requireReason(), controller.rejectKycRequest);
documentsRoutes.post("/kyc-requests/:requestId/cancel", requireAnyPermission(["documentKyc.requests.cancel", "documentKyc.requests.cancelAny", "approvals.requests.cancel", "approvals.requests.cancelAny"]), requireReason(), controller.cancelKycRequest);
documentsRoutes.post("/kyc-requests/:requestId/apply", requireAnyPermission(["documentKyc.requests.apply", "employeeDocuments.verify", "approvals.operationExecutor.apply"]), requireReason(), controller.applyKycRequest);
documentsRoutes.get("/kyc-requests/:requestId/timeline", requireAnyPermission(["documentKyc.requests.view", "documentKyc.requests.audit.view", "documentKyc.requests.review", "documentKyc.requests.approve", "documentKyc.requests.finalApprove", "documentKyc.requests.apply", "approvals.operationExecutor.view", "approvals.operationExecutor.apply", "approvals.requests.audit.view", "documents.view"]), controller.kycRequestTimeline);
documentsRoutes.get("/kyc-requests/:requestId/audit", requireAnyPermission(["documentKyc.requests.view", "documentKyc.requests.audit.view", "documentKyc.requests.review", "documentKyc.requests.approve", "documentKyc.requests.finalApprove", "documentKyc.requests.apply", "approvals.operationExecutor.view", "approvals.operationExecutor.apply", "approvals.requests.audit.view", "documents.view"]), controller.kycRequestTimeline);
documentsRoutes.get("/:id", requireAnyPermission(["documents.view", "self.documents.view", "documentKyc.requests.view", "documentKyc.requests.review", "documentKyc.requests.apply"]), controller.getDocument);
documentsRoutes.patch("/:id", requirePermission("documents.edit"), controller.updateDocument);
documentsRoutes.post("/:id/replace", requirePermission("documents.upload"), controller.replaceDocument);
documentsRoutes.post("/:id/archive", requirePermission("documents.edit"), requireReason(), controller.archiveDocument);
documentsRoutes.get("/:id/history", requirePermission("documents.view"), controller.documentHistory);
documentsRoutes.delete("/:id", requirePermission("documents.delete"), requireReason(), controller.deleteDocument);
documentsRoutes.get("/:id/download", requireAnyPermission(["documents.download", "self.documents.view", "employeeDocuments.download", "documentKyc.requests.view", "documentKyc.requests.review", "documentKyc.requests.apply"]), controller.downloadDocument);

export { documentsRoutes };
