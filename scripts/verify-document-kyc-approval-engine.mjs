import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const fail = [];
const mustInclude = (label, content, needle) => {
  if (!content.includes(needle)) fail.push(`${label}: missing ${needle}`);
};

const migration = read("migrations/0069_employee_document_kyc_approval_engine.sql");
const completionMigration = read("migrations/0070_document_kyc_completion.sql");
const stagingMigration = read("migrations/0071_document_kyc_staging_hardening.sql");
const routes = read("src/routes/documents.routes.ts");
const service = read("src/modules/documents/document-kyc-approval.service.ts");
const repository = read("src/modules/documents/document-kyc.repository.ts");
const validators = read("src/modules/documents/document-kyc.validators.ts");
const accessService = read("src/modules/documents/document-access.service.ts");
const documentService = read("src/modules/documents/documents.service.ts");
const types = read("src/modules/documents/document-kyc.types.ts");
const approvalEngine = read("src/modules/approvals/approval-workflow-engine.service.ts");
const approvalTypes = read("src/modules/approvals/approval-workflow-engine.types.ts");
const documentsPage = read("frontend/src/features/documents/DocumentsPage.tsx");
const myDocumentsPage = read("frontend/src/features/documents/MyDocumentsKycPage.tsx");
const detailDrawer = read("frontend/src/features/documents/DocumentKycDetailDrawer.tsx");
const documentsApi = read("frontend/src/features/documents/documents.api.ts");
const dialog = read("frontend/src/features/documents/DocumentKycRequestDialog.tsx");
const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
const tests = read("tests/document-kyc-approval-integration.test.ts");

[
  "employee_kyc_update_requests",
  "verification_status",
  "approval_request_id",
  "DOCUMENT_KYC_UPDATE_DEFAULT",
  "OPERATION_OWNER",
  "OPERATION_FINAL_APPROVER",
  "documentKyc.requests.createForOthers",
  "documentKyc.requests.apply",
].forEach((needle) => mustInclude("migration", migration, needle));

[
  "document_number",
  "issue_date",
  "expiry_date",
  "issuing_country",
  "employeeDocuments.download",
  "approvals.operationOwner.approve",
  "approvals.operationFinal.approve",
].forEach((needle) => mustInclude("completion migration", completionMigration, needle));

[
  "document_upload_staging",
  "file_key TEXT NOT NULL",
  "STAGED",
  "ATTACHED_TO_REQUEST",
  "CONSUMED",
  "DOCUMENT_KYC_UPDATE",
  "idx_document_upload_staging_file_key",
].forEach((needle) => mustInclude("staging migration", stagingMigration, needle));

[
  "documentsRoutes.get(\"/kyc-requests\"",
  "documentsRoutes.post(\"/kyc-requests\"",
  "documentsRoutes.post(\"/kyc-requests/:requestId/approve\"",
  "documentsRoutes.post(\"/kyc-requests/:requestId/reject\"",
  "documentsRoutes.post(\"/kyc-requests/:requestId/cancel\"",
  "documentsRoutes.post(\"/kyc-requests/:requestId/apply\"",
  "documentsRoutes.get(\"/kyc-requests/:requestId/timeline\"",
  "documentsRoutes.get(\"/kyc-requests/:requestId/audit\"",
  "approvals.operationOwner.approve",
  "approvals.operationFinal.approve",
  "approvals.operationOwner.reject",
  "approvals.operationFinal.reject",
  "approvals.operationExecutor.apply",
  "employeeDocuments.download",
].forEach((needle) => mustInclude("routes", routes, needle));
const approveRoute = routes.match(/kyc-requests\/:requestId\/approve[\s\S]*?controller\.approveKycRequest\);/)?.[0] ?? "";
const applyRoute = routes.match(/kyc-requests\/:requestId\/apply[\s\S]*?controller\.applyKycRequest\);/)?.[0] ?? "";
if (approveRoute.includes("approvals.operationExecutor.apply")) fail.push("routes: operation executor apply must not be an approval permission");
if (applyRoute.includes("approvals.operationExecutor.view")) fail.push("routes: executor view must not be enough to apply document/KYC changes");

[
  "canCreateDocumentKycForEmployee",
  "buildDocumentKycVisibilityFilter",
  "canViewDocumentKycRequest",
  "allowModuleBoundCreateForOthers",
  "modulePermission: \"documentKyc.requests.createForOthers\"",
  "moduleCancelPermission: \"documentKyc.requests.cancel\"",
  "moduleCancelAnyPermission: \"documentKyc.requests.cancelAny\"",
  "resolveOperationResponsibility",
  "assertDocumentKycExecutionAllowed",
  "already_submitted",
  "applyApprovedDocumentKycRequest",
  "DOCUMENT_KYC_NO_APPLICABLE_CHANGE",
  "DOCUMENT_SOURCE_REQUIRED",
  "assertActionableDocumentKycRequest",
  "validateDocumentKycStagedUploadForCreate",
  "validateDocumentKycStagedUploadForApply",
  "The staged document file could not be verified. Please upload the document again.",
  "Please provide at least one document/KYC change to review.",
  "Document requests need an existing document or secure staged upload before they can be submitted.",
  "A document file or existing document record is required for this request type.",
  "if (isDocumentRelated && !hasExistingDocument && !hasStagedUpload && !metadataOnlyDocumentReviewEnabled)",
  "documentRelatedRequestTypes.has(request.request_type)",
  "document_related_without_source",
  "metadataOnlyDocumentReviewEnabled = false",
  "A document file or existing document record is required before this request can be applied.",
  "findEmployeeDocumentById",
  "manual_review_required",
  "FAILED_TO_APPLY",
].forEach((needle) => mustInclude("service", service, needle));

[
  "applyEmployeeProfilePatch",
  "findEmployeeDocumentById",
  "findStagedUploadForCreate",
  "findStagedUploadForApply",
  "attachStagedUploadToRequest",
  "source_kyc_request_id",
  "applyApprovedDocumentKycBundle",
  "env.DB.batch(statements)",
  "employeePatchColumns",
  "input.stagedUpload?.file_key ?? input.sourceDocument?.file_key",
  "status = 'CONSUMED'",
].forEach((needle) => mustInclude("repository", repository, needle));
if (repository.includes("approved://")) fail.push("repository: approved:// placeholder must not create verified documents");
if (repository.includes("input.request.staged_file_key ?? input.sourceDocument?.file_key")) {
  fail.push("repository: client-provided staged_file_key must not become a verified document file_key directly");
}

[
  "api_key",
  "device_secret",
  "assertSafeDocumentKycPayload(nested",
  "DOCUMENT_KYC_DOCUMENT_TYPES",
  "canonicalRequestType",
  "normalizeDocumentKycDocumentType",
  "allowedDocumentKycFieldsByRequestType",
  "assertAllowedRequestedFields",
  "Document type is required for document-related requests.",
].forEach((needle) => mustInclude("validators", validators, needle));

[
  "PERSONAL_INFO_UPDATE",
  "CONTACT_INFO_UPDATE",
  "EMERGENCY_CONTACT_UPDATE",
  "ADDRESS_UPDATE",
  "BANK_ACCOUNT_UPDATE",
  "PASSPORT_UPDATE",
  "NATIONAL_ID_UPDATE",
  "WORK_PERMIT_UPDATE",
  "VISA_UPDATE",
  "CONTRACT_DOCUMENT_UPDATE",
  "MEDICAL_DOCUMENT_UPDATE",
  "PROFILE_PHOTO_UPDATE",
  "DEPENDENT_INFO_UPDATE",
  "DOCUMENT_RENEWAL",
  "DOCUMENT_CORRECTION",
  "DOCUMENT_VERIFICATION",
  "GENERAL_KYC_UPDATE",
  "OTHER_DOCUMENT_UPDATE",
  "PASSPORT",
  "NATIONAL_ID",
  "WORK_PERMIT",
  "VISA",
  "EMPLOYMENT_CONTRACT",
  "MEDICAL_CERTIFICATE",
  "BANK_DOCUMENT",
  "PROFILE_PHOTO",
  "ADDRESS_PROOF",
  "EMERGENCY_CONTACT_DOCUMENT",
  "OTHER",
].forEach((needle) => mustInclude("types", types, needle));

[
  "canViewEmployeeDocument",
  "canDownloadEmployeeDocument",
  "self.documents.view",
  "employeeDocuments.download",
  "Own-document policy",
].forEach((needle) => mustInclude("document access", accessService, needle));
if (accessService.indexOf("isOwnDocument && [\"view\", \"download\"].includes(action)") > accessService.indexOf("document.is_sensitive === 1")) {
  fail.push("document access: own-document policy must be evaluated before sensitive coworker restriction");
}

[
  "findEmployeeByUserId",
  "accessService.canViewEmployeeDocument",
  "selfServiceOnly",
  "actorDocumentEmployee?.id ? true : includeSensitive(context)",
  "has_file: Boolean(document.file_key)",
].forEach((needle) => mustInclude("document service", documentService, needle));

[
  "\"DOCUMENT_KYC_UPDATE\"",
  "\"DOCUMENT_APPROVAL\"",
].forEach((needle) => mustInclude("approval types", approvalTypes, needle));

[
  "MODULE_BOUND_DOCUMENT_KYC_ACTION_MESSAGE",
  "documentKyc.requests.createForOthers",
  "documentKyc.requests.cancel",
  "DOCUMENT_APPROVAL",
].forEach((needle) => mustInclude("approval engine", approvalEngine, needle));

[
  "DocumentKycRequestDialog",
  "DocumentKycRequestsTable",
  "documentsApi.createKycRequest",
  "documentsApi.submitKycRequest",
].forEach((needle) => mustInclude("documents page", documentsPage, needle));

[
  "MyDocumentsKycPage",
  "canSelectEmployee={false}",
  "Your employee profile is not linked",
  "documentsApi.list({ page: 1, page_size: 25 })",
  "documentsApi.listKycRequests",
  "My Documents",
  "No documents are available for your account.",
  "documentsApi.download",
  "document.has_file",
  "No file attached.",
].forEach((needle) => mustInclude("self-service page", myDocumentsPage, needle));

[
  "documentsApi.kycTimeline",
  "Approval timeline",
  "Requested changes",
  "Raw request payload",
  "apply_error_message",
].forEach((needle) => mustInclude("detail drawer", detailDrawer, needle));

[
  "kycAudit",
  "/documents/kyc-requests/${id}/audit",
].forEach((needle) => mustInclude("documents api", documentsApi, needle));

[
  "EmployeeCombobox",
  "canSelectEmployee",
  "Submit for approval",
  "documentTypes",
  "Select document type",
  "Issue date",
  "Expiry date",
  "requested_field",
  "Please select the field you want HR to review.",
  "A secure document upload or existing document record is required for this request type.",
  "Secure document upload will be available through the document upload flow.",
].forEach((needle) => mustInclude("dialog", dialog, needle));
if (dialog.includes("placeholder=\"passport, work_permit, id_card\"")) fail.push("dialog: raw free-text document type input is still present");
if (dialog.includes("staged_file_key")) fail.push("dialog: raw staged_file_key input must not be exposed");

[
  "documentsApi.approveKycRequest",
  "DOCUMENT_KYC_UPDATE",
  "DOCUMENT_APPROVAL",
  "approvals.operationOwner.approve",
  "approvals.operationFinal.approve",
].forEach((needle) => mustInclude("approvals page", approvalsPage, needle));
if (approvalsPage.includes("approvals.operationExecutor.apply\") || has(\"documentKyc.requests.approve")) {
  fail.push("approvals page: executor apply must not show approve actions");
}

[
  "normal employee cannot create a document/KYC request for another employee",
  "module-bound approval creation honors documentKyc.requests.createForOthers",
  "generic approval route blocks DOCUMENT_KYC_UPDATE",
  "sensitive nested api_key payloads are rejected",
  "accepts all canonical request types",
  "validates canonical document types",
  "rejects unsupported profile fields",
  "no-op apply is held for manual review",
  "document row-level access helpers protect view and download",
  "operation owner/final approval and executor apply boundaries",
  "staged document source safety prevents verified documents from client-provided keys",
  "empty or no-change KYC requests are rejected before submission",
  "document-related profile field updates require a real document source",
  "tests passport, work permit, visa, and national ID source-required examples",
  "CONTACT_INFO_UPDATE",
  "ADDRESS_UPDATE",
  "PASSPORT_UPDATE",
  "WORK_PERMIT_UPDATE",
  "VISA_UPDATE",
  "NATIONAL_ID_UPDATE",
  "self-service UI fetches official documents and KYC requests",
  "KYC detail drawer fetches timeline",
  "KYC audit route is available",
  "frontend approvals dispatches DOCUMENT_KYC_UPDATE through documentsApi",
].forEach((needle) => mustInclude("tests", tests, needle));

const frontendSource = fs.readdirSync(path.join(root, "frontend", "src"), { recursive: true })
  .filter((file) => String(file).endsWith(".ts") || String(file).endsWith(".tsx"))
  .map((file) => read(path.join("frontend", "src", String(file))));
if (frontendSource.some((content) => /\b(window\.)?alert\s*\(/.test(content) || /\b(window\.)?confirm\s*\(/.test(content))) {
  fail.push("frontend: browser alert/confirm usage detected");
}

if (fail.length > 0) {
  console.error("Document/KYC approval engine verification failed:");
  for (const item of fail) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Document/KYC approval engine verification passed.");
