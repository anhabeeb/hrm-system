import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateDocumentKycRequest } from "../src/modules/documents/document-kyc.validators";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("document/KYC approval engine integration", () => {
  it("accepts all canonical request types with valid document metadata where required", () => {
    const documentRelated = new Set([
      "PASSPORT_UPDATE",
      "NATIONAL_ID_UPDATE",
      "WORK_PERMIT_UPDATE",
      "VISA_UPDATE",
      "CONTRACT_DOCUMENT_UPDATE",
      "MEDICAL_DOCUMENT_UPDATE",
      "PROFILE_PHOTO_UPDATE",
      "DOCUMENT_RENEWAL",
      "DOCUMENT_CORRECTION",
      "DOCUMENT_VERIFICATION",
      "OTHER_DOCUMENT_UPDATE",
    ]);
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
    ].forEach((request_type) => {
      expect(() => validateDocumentKycRequest({
        request_type,
        document_type: documentRelated.has(request_type) ? "OTHER" : undefined,
        reason: `Validate ${request_type}`,
      })).not.toThrow();
    });
  });

  it("keeps legacy request aliases by mapping them to canonical types", () => {
    expect(validateDocumentKycRequest({ request_type: "PROFILE_FIELD_UPDATE", requested_field: "phone", requested_value_json: { phone: "7777777" }, reason: "Update phone" }).request_type).toBe("GENERAL_KYC_UPDATE");
    expect(validateDocumentKycRequest({ request_type: "DOCUMENT_UPLOAD", document_type: "passport", reason: "Upload passport" }).request_type).toBe("OTHER_DOCUMENT_UPDATE");
    expect(validateDocumentKycRequest({ request_type: "DOCUMENT_REPLACEMENT", document_type: "visa", reason: "Renew visa" }).request_type).toBe("DOCUMENT_RENEWAL");
    expect(validateDocumentKycRequest({ request_type: "KYC_UPDATE", reason: "General KYC" }).request_type).toBe("GENERAL_KYC_UPDATE");
  });

  it("validates canonical document types and rejects unsupported free text", () => {
    ["PASSPORT", "NATIONAL_ID", "WORK_PERMIT", "VISA", "EMPLOYMENT_CONTRACT", "MEDICAL_CERTIFICATE", "BANK_DOCUMENT", "PROFILE_PHOTO", "ADDRESS_PROOF", "EMERGENCY_CONTACT_DOCUMENT", "OTHER"].forEach((document_type) => {
      expect(() => validateDocumentKycRequest({ request_type: "DOCUMENT_VERIFICATION", document_type, reason: "Verify document" })).not.toThrow();
    });
    expect(() => validateDocumentKycRequest({ request_type: "DOCUMENT_VERIFICATION", document_type: "random free text", reason: "Verify document" })).toThrow(/valid document type/);
  });

  it("allows profile-only requests without document type but requires document type for document requests", () => {
    expect(() => validateDocumentKycRequest({ request_type: "CONTACT_INFO_UPDATE", requested_field: "phone", requested_value_json: { phone: "7777777" }, reason: "Update phone" })).not.toThrow();
    expect(() => validateDocumentKycRequest({ request_type: "PASSPORT_UPDATE", reason: "Renew passport" })).toThrow(/Document type is required/);
  });

  it("rejects unsupported profile fields before approval can be created", () => {
    expect(() => validateDocumentKycRequest({
      request_type: "CONTACT_INFO_UPDATE",
      requested_field: "salary",
      requested_value_json: { salary: 9999 },
      reason: "Try unsupported field",
    })).toThrow(/not allowed/);
    expect(() => validateDocumentKycRequest({
      request_type: "BANK_ACCOUNT_UPDATE",
      requested_value_json: { bank_name: "Bank", payroll_role: "admin" },
      reason: "Try unsupported key",
    })).toThrow(/not allowed/);
  });

  it("sensitive nested api_key payloads are rejected", () => {
    expect(() => validateDocumentKycRequest({
      request_type: "KYC_UPDATE",
      reason: "Update KYC details",
      requested_value_json: { nested: [{ api_key: "secret" }] },
    })).toThrow(/Sensitive field/);
  });

  it("device_secret remains rejected while safe payloads pass", () => {
    expect(() => validateDocumentKycRequest({
      request_type: "PROFILE_FIELD_UPDATE",
      reason: "Update phone number",
      requested_field: "phone",
      requested_value_json: { phone: "7777777" },
    })).not.toThrow();
    expect(() => validateDocumentKycRequest({
      request_type: "DOCUMENT_UPLOAD",
      document_type: "OTHER",
      reason: "Upload document",
      requested_value_json: { device_secret: "hidden" },
    })).toThrow(/Sensitive field/);
  });

  it("no-op apply is held for manual review and apply uses a batch bundle", () => {
    const service = read("src/modules/documents/document-kyc-approval.service.ts");
    const repository = read("src/modules/documents/document-kyc.repository.ts");
    expect(service).toContain("DOCUMENT_KYC_NO_APPLICABLE_CHANGE");
    expect(service).toContain("manual_review_required: true");
    expect(repository).toContain("applyApprovedDocumentKycBundle");
    expect(repository).toContain("env.DB.batch(statements)");
    expect(repository).toContain("source_kyc_request_id");
    expect(repository).not.toContain("approved://");
  });

  it("staged document source safety prevents verified documents from client-provided keys", () => {
    const service = read("src/modules/documents/document-kyc-approval.service.ts");
    const repository = read("src/modules/documents/document-kyc.repository.ts");
    const migration = read("migrations/0071_document_kyc_staging_hardening.sql");
    expect(migration).toContain("document_upload_staging");
    expect(migration).toContain("ATTACHED_TO_REQUEST");
    expect(migration).toContain("CONSUMED");
    expect(service).toContain("DOCUMENT_SOURCE_REQUIRED");
    expect(service).toContain("validateDocumentKycStagedUploadForCreate");
    expect(service).toContain("validateDocumentKycStagedUploadForApply");
    expect(service).toContain("The staged document file could not be verified. Please upload the document again.");
    expect(service).toContain("The staged document file is not verified or is no longer available. Please upload the document again.");
    expect(service).toContain("findEmployeeDocumentById");
    expect(repository).toContain("findStagedUploadForCreate");
    expect(repository).toContain("findStagedUploadForApply");
    expect(repository).toContain("attachStagedUploadToRequest");
    expect(repository).toContain("input.stagedUpload?.file_key ?? input.sourceDocument?.file_key");
    expect(repository).not.toContain("input.request.staged_file_key ?? input.sourceDocument?.file_key");
    expect(repository).toContain("status = 'CONSUMED'");
    expect(repository).toContain("verification_status, source_kyc_request_id");
  });

  it("empty or no-change KYC requests are rejected before submission", () => {
    const service = read("src/modules/documents/document-kyc-approval.service.ts");
    expect(service).toContain("assertActionableDocumentKycRequest");
    expect(service).toContain("Please provide at least one document/KYC change to review.");
    expect(service).toContain("Document requests need an existing document or secure staged upload before they can be submitted.");
    expect(service).toContain("A document file or existing document record is required for this request type.");
    expect(service).toContain("metadataOnlyDocumentReviewEnabled = false");
    expect(service).toContain("input.document_id && !sourceDocument");
    expect(service).toContain("stagedUpload");
  });

  it("document-related profile field updates require a real document source", () => {
    const service = read("src/modules/documents/document-kyc-approval.service.ts");
    const validators = read("src/modules/documents/document-kyc.validators.ts");
    const sourceRequirementIndex = service.indexOf("if (isDocumentRelated && !hasExistingDocument && !hasStagedUpload && !metadataOnlyDocumentReviewEnabled)");
    const profileChangeIndex = service.indexOf("if (!hasProfileChange && !hasActionableDocumentChange)");
    const applySourceRequirementIndex = service.indexOf("source: \"document_related_without_source\"");
    const applyBundleIndex = service.indexOf("applyApprovedDocumentKycBundle(env");
    expect(sourceRequirementIndex).toBeGreaterThan(-1);
    expect(profileChangeIndex).toBeGreaterThan(sourceRequirementIndex);
    expect(applySourceRequirementIndex).toBeGreaterThan(-1);
    expect(applyBundleIndex).toBeGreaterThan(applySourceRequirementIndex);
    expect(validators).toContain("PASSPORT_UPDATE");
    expect(validators).toContain("WORK_PERMIT_UPDATE");
    expect(validators).toContain("VISA_UPDATE");
    expect(validators).toContain("NATIONAL_ID_UPDATE");
    expect(validators).toContain("CONTACT_INFO_UPDATE");
    expect(validators).toContain("ADDRESS_UPDATE");
  });

  it("tests passport, work permit, visa, and national ID source-required examples", () => {
    const service = read("src/modules/documents/document-kyc-approval.service.ts");
    expect(service).toContain("documentRelatedRequestTypes.has(requestType)");
    expect(service).toContain("documentRelatedRequestTypes.has(request.request_type)");
    expect(service).toContain("hasExistingDocument");
    expect(service).toContain("hasStagedUpload");
    expect(service).toContain("hasDocumentSource");
    expect(() => validateDocumentKycRequest({ request_type: "CONTACT_INFO_UPDATE", requested_field: "phone", requested_value_json: { phone: "7777777" }, reason: "Update phone" })).not.toThrow();
    expect(() => validateDocumentKycRequest({ request_type: "ADDRESS_UPDATE", requested_field: "address", requested_value_json: { address: "New address" }, reason: "Update address" })).not.toThrow();
    expect(() => validateDocumentKycRequest({ request_type: "PASSPORT_UPDATE", document_type: "PASSPORT", requested_field: "passport_number", requested_value_json: { passport_number: "A1234567" }, reason: "Update passport" })).not.toThrow();
    expect(() => validateDocumentKycRequest({ request_type: "WORK_PERMIT_UPDATE", document_type: "WORK_PERMIT", requested_value_json: { document_number: "WP-1" }, reason: "Update work permit" })).not.toThrow();
    expect(() => validateDocumentKycRequest({ request_type: "VISA_UPDATE", document_type: "VISA", requested_value_json: { document_number: "V-1" }, reason: "Update visa" })).not.toThrow();
    expect(() => validateDocumentKycRequest({ request_type: "NATIONAL_ID_UPDATE", document_type: "NATIONAL_ID", requested_field: "id_card_number", requested_value_json: { id_card_number: "ID-1" }, reason: "Update ID" })).not.toThrow();
  });

  it("document row-level access helpers protect view and download", () => {
    const access = read("src/modules/documents/document-access.service.ts");
    const service = read("src/modules/documents/documents.service.ts");
    expect(access).toContain("canViewEmployeeDocument");
    expect(access).toContain("canDownloadEmployeeDocument");
    expect(access).toContain("self.documents.view");
    expect(access).toContain("employeeDocuments.download");
    expect(access).toContain("Own-document policy");
    expect(access.indexOf("isOwnDocument && [\"view\", \"download\"].includes(action)")).toBeLessThan(access.indexOf("document.is_sensitive === 1"));
    expect(service).toContain("findEmployeeByUserId");
    expect(service).toContain("accessService.canViewEmployeeDocument");
    expect(service).toContain("actorDocumentEmployee?.id ? true : includeSensitive(context)");
    expect(service).toContain("has_file: Boolean(document.file_key)");
  });

  it("route permissions align with operation owner/final approval and executor apply boundaries", () => {
    const routes = read("src/routes/documents.routes.ts");
    expect(routes).toContain("approvals.operationOwner.approve");
    expect(routes).toContain("approvals.operationFinal.approve");
    expect(routes).toContain("approvals.operationOwner.reject");
    expect(routes).toContain("approvals.operationFinal.reject");
    const approveRoute = routes.match(/kyc-requests\/:requestId\/approve[\s\S]*?controller\.approveKycRequest\);/)?.[0] ?? "";
    const applyRoute = routes.match(/kyc-requests\/:requestId\/apply[\s\S]*?controller\.applyKycRequest\);/)?.[0] ?? "";
    expect(approveRoute).not.toContain("approvals.operationExecutor.apply");
    expect(applyRoute).toContain("approvals.operationExecutor.apply");
    expect(applyRoute).not.toContain("approvals.operationExecutor.view");
  });

  it("normal employee cannot create a document/KYC request for another employee", () => {
    const service = read("src/modules/documents/document-kyc-approval.service.ts");
    expect(service).toContain("canCreateDocumentKycForEmployee");
    expect(service).toContain("You cannot create document/KYC requests for another employee.");
    expect(service).toContain("documentKyc.requests.createForOthers");
  });

  it("module-bound approval creation honors documentKyc.requests.createForOthers", () => {
    const service = read("src/modules/documents/document-kyc-approval.service.ts");
    const approvalEngine = read("src/modules/approvals/approval-workflow-engine.service.ts");
    expect(service).toContain("allowModuleBoundCreateForOthers: true");
    expect(service).toContain("modulePermission: \"documentKyc.requests.createForOthers\"");
    expect(approvalEngine).toContain("options.moduleOperationType === \"DOCUMENT_KYC_UPDATE\"");
    expect(approvalEngine).toContain("permissionService.hasPermission(context, \"documentKyc.requests.createForOthers\")");
  });

  it("generic approval route blocks DOCUMENT_KYC_UPDATE unless called from the module", () => {
    const approvalEngine = read("src/modules/approvals/approval-workflow-engine.service.ts");
    expect(approvalEngine).toContain("MODULE_BOUND_DOCUMENT_KYC_ACTION_MESSAGE");
    expect(approvalEngine).toContain("request.operation_type === \"DOCUMENT_KYC_UPDATE\"");
    expect(approvalEngine).toContain("request.operation_type === \"DOCUMENT_APPROVAL\"");
  });

  it("document/KYC row-level visibility and execution use operation ownership", () => {
    const service = read("src/modules/documents/document-kyc-approval.service.ts");
    expect(service).toContain("buildDocumentKycVisibilityFilter");
    expect(service).toContain("canViewDocumentKycRequest");
    expect(service).toContain("resolveOperationResponsibility");
    expect(service).toContain("assertDocumentKycExecutionAllowed");
    expect(service).toContain("resolved_department_id");
    expect(service).toContain("required_role_id");
  });

  it("idempotent repeated submit returns already_submitted", () => {
    const service = read("src/modules/documents/document-kyc-approval.service.ts");
    expect(service).toContain("already_submitted: true");
    expect(service).toContain("approval_request_id");
  });

  it("frontend approvals dispatches DOCUMENT_KYC_UPDATE through documentsApi", () => {
    const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
    expect(approvalsPage).toContain("documentsApi.approveKycRequest");
    expect(approvalsPage).toContain("documentsApi.rejectKycRequest");
    expect(approvalsPage).toContain("documentsApi.cancelKycRequest");
    expect(approvalsPage).toContain("DOCUMENT_KYC_UPDATE");
    expect(approvalsPage).toContain("approvals.operationOwner.approve");
    expect(approvalsPage).toContain("approvals.operationFinal.approve");
    expect(approvalsPage).not.toContain("approvals.operationExecutor.apply\") || has(\"documentKyc.requests.approve");
  });

  it("self-service UI fetches official documents and KYC requests", () => {
    const selfPage = read("frontend/src/features/documents/MyDocumentsKycPage.tsx");
    expect(selfPage).toContain("documentsApi.list({ page: 1, page_size: 25 })");
    expect(selfPage).toContain("documentsApi.listKycRequests");
    expect(selfPage).toContain("My Documents");
    expect(selfPage).toContain("No documents are available for your account.");
    expect(selfPage).toContain("documentsApi.download");
    expect(selfPage).toContain("document.has_file");
    expect(selfPage).toContain("No file attached.");
    expect(selfPage).toContain("Request update");
  });

  it("KYC detail drawer fetches timeline and avoids raw JSON-only display", () => {
    const drawer = read("frontend/src/features/documents/DocumentKycDetailDrawer.tsx");
    expect(drawer).toContain("documentsApi.kycTimeline");
    expect(drawer).toContain("Approval timeline");
    expect(drawer).toContain("Requested changes");
    expect(drawer).toContain("apply_error_message");
    expect(drawer).toContain("Raw request payload");
  });

  it("KYC audit route is available as a timeline-backed audit endpoint", () => {
    const routes = read("src/routes/documents.routes.ts");
    const api = read("frontend/src/features/documents/documents.api.ts");
    expect(routes).toContain("kyc-requests/:requestId/audit");
    expect(routes).toContain("controller.kycRequestTimeline");
    expect(api).toContain("kycAudit");
  });

  it("self-service UI locks employee selection while admin UI supports selectors", () => {
    const selfPage = read("frontend/src/features/documents/MyDocumentsKycPage.tsx");
    const dialog = read("frontend/src/features/documents/DocumentKycRequestDialog.tsx");
    expect(selfPage).toContain("canSelectEmployee={false}");
    expect(dialog).toContain("EmployeeCombobox");
    expect(dialog).toContain("Your employee profile is not linked to this login");
    expect(dialog).toContain("documentTypes");
    expect(dialog).toContain("Select document type");
    expect(dialog).toContain("Issue date");
    expect(dialog).toContain("Expiry date");
    expect(dialog).toContain("Please select the field you want HR to review.");
    expect(dialog).toContain("A secure document upload or existing document record is required for this request type.");
    expect(dialog).not.toContain("staged_file_key");
    expect(dialog).not.toContain("placeholder=\"passport, work_permit, id_card\"");
  });
});
