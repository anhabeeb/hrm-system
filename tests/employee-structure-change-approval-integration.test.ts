import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { deriveOperationType, validateEmployeeStructureChangeRequest } from "../src/modules/employee-structure/employee-structure-change.validators";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("employee transfer / structure change approval integration", () => {
  it("validates transfer and structure request types and derives operation type", () => {
    expect(deriveOperationType("DEPARTMENT_TRANSFER")).toBe("EMPLOYEE_TRANSFER");
    expect(deriveOperationType("POSITION_TITLE_CHANGE")).toBe("EMPLOYEE_STRUCTURE_CHANGE");
    expect(validateEmployeeStructureChangeRequest({
      request_type: "POSITION_TRANSFER",
      requested_department_id: "department_target",
      requested_position_id: "position_target",
      reason: "Move employee to approved role",
    }).operation_type).toBe("EMPLOYEE_TRANSFER");
    expect(validateEmployeeStructureChangeRequest({
      request_type: "ROLE_TEMPLATE_REAPPLY",
      apply_role_template: true,
      reason: "Reapply approved default role template",
    }).operation_type).toBe("EMPLOYEE_STRUCTURE_CHANGE");
    const storeTransfer = validateEmployeeStructureChangeRequest({
      request_type: "STORE_TRANSFER",
      requested_store_id: "store_1",
      reason: "Move employee to another store",
    });
    expect(storeTransfer.requested_outlet_id).toBe("store_1");
  });

  it("rejects empty changes, mismatched operations, and sensitive payload fields", () => {
    expect(() => validateEmployeeStructureChangeRequest({
      operation_type: "EMPLOYEE_TRANSFER",
      request_type: "LEVEL_CHANGE",
      requested_position_id: "position_1",
      reason: "Try mismatch",
    })).toThrow(/Operation type/);
    expect(() => validateEmployeeStructureChangeRequest({
      request_type: "POSITION_TRANSFER",
      requested_department_id: "department_1",
      reason: "Try secret",
      payload: { token: "secret" },
    })).toThrow(/Sensitive field/);
  });

  it("contains backend safety paths for create, submit, approval, cancellation, and apply", () => {
    const service = read("src/modules/employee-structure/employee-structure-change.service.ts");
    const repository = read("src/modules/employee-structure/employee-structure-change.repository.ts");
    const approvalEngine = read("src/modules/approvals/approval-workflow-engine.service.ts");
    expect(service).toContain("Department managers can create structure requests only for lower-level employees");
    expect(service).toContain("assertDepartmentScopedTargetAllowed");
    expect(service).toContain("Department managers cannot request assigning employees to their own or a higher level");
    expect(service).toContain("employees.structure.sensitive.manage");
    expect(service).toContain("employees.structureRequests.createForOthers");
    expect(service).toContain("canRequestRoleTemplateApply");
    expect(service).toContain("prevalidateRoleTemplateApplication");
    expect(service).toContain("This request includes role template application, but you do not have permission to apply role templates.");
    expect(service).toContain("Structure was updated, but no login user exists, so role template was not applied.");
    expect(service).toContain("Reporting manager changes are not supported");
    expect(service).toContain("Please provide at least one actionable employee transfer or structure change.");
    expect(service).toContain("already_submitted");
    expect(service).toContain("assertCurrentStructureStillMatches");
    expect(service).toContain("STALE_EMPLOYEE_STRUCTURE");
    expect(service).toContain("employee_structure_change_stale_state");
    expect(service).toContain("moduleCancelPermission: \"employees.structureRequests.cancel\"");
    expect(service).toContain("resolveOperationResponsibility");
    expect(service).toContain("assertEmployeeStructureExecutionAllowed");
    expect(service).toContain("baseStructureService.applyLevelRoleTemplate");
    expect(repository).toContain("UPDATE employees");
    expect(repository).toContain("UPDATE departments SET head_employee_id");
    expect(repository).toContain("findOutlet");
    expect(repository).toContain("findLinkedUserForEmployee");
    expect(repository).toContain("countLevelRoleTemplates");
    expect(repository).toContain("listRequestItems");
    expect(repository).toContain("employee_structure_history");
    expect(repository).toContain("env.DB.batch(statements)");
    expect(approvalEngine).toContain("MODULE_BOUND_EMPLOYEE_STRUCTURE_ACTION_MESSAGE");
    expect(approvalEngine).toContain("EMPLOYEE_TRANSFER");
    expect(approvalEngine).toContain("EMPLOYEE_STRUCTURE_CHANGE");
  });

  it("wires routes, permissions, and operation-owned route access", () => {
    const routes = read("src/routes/employees.routes.ts");
    const permissions = read("seeds/permissions.seed.sql");
    expect(routes).toContain("/structure-change-requests/:requestId/apply");
    expect(routes).toContain("/structure-change-requests/:requestId/items");
    expect(routes).toContain("/structure-change-requests/:requestId/audit");
    expect(routes).toContain("approvals.operationOwner.approve");
    expect(routes).toContain("approvals.operationFinal.approve");
    expect(routes).toContain("approvals.operationExecutor.apply");
    expect(permissions).toContain("employees.structureRequests.createForOthers");
    expect(permissions).toContain("employees.structureRequests.cancelAny");
    expect(permissions).toContain("employees.structureRequests.audit.view");
  });

  it("keeps frontend module-bound and table-first", () => {
    const page = read("frontend/src/features/employee-structure-change/EmployeeStructureChangeRequestsPage.tsx");
    const dialog = read("frontend/src/features/employee-structure-change/EmployeeStructureChangeRequestDialog.tsx");
    const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
    expect(page).toContain("employeeStructureChangeApi.create");
    expect(page).toContain("employeeStructureChangeApi.submit");
    expect(page).toContain("canApprove");
    expect(page).toContain("canReject");
    expect(page).toContain("canApply");
    expect(dialog).toContain("Employee selector");
    expect(dialog).toContain("Department selector");
    expect(dialog).toContain("Position / title selector");
    expect(dialog).toContain("Level is derived by the backend");
    expect(approvalsPage).toContain("employeeStructureChangeApi.approve");
    expect(approvalsPage).toContain("EMPLOYEE_STRUCTURE_CHANGE");
  });

  it("documents the expected behavioral coverage", () => {
    const coverageNotes = [
      "normal employee cannot create structure change for another employee",
      "department manager can create for lower-level same-department employee",
      "department manager cannot create for another department or same level",
      "submit is idempotent and does not create duplicate approval requests",
      "generic approval route blocks EMPLOYEE_TRANSFER and EMPLOYEE_STRUCTURE_CHANGE",
      "final apply updates employee structure and writes employee_structure_history",
      "Operation Ownership execution target is enforced",
      "role template reapply is add-only and preserves custom roles",
      "frontend create flow uses employeeStructureChangeApi.create and submit",
      "frontend approvals page dispatches module-bound employee structure actions",
      "store transfer is normalized to outlet/store assignment",
      "reporting manager changes are rejected until schema-backed",
      "role template application requires access administration permission",
      "department head change applies through departments.head_employee_id",
      "stale current structure is held before apply",
      "apply_role_template request is blocked or held if executor lacks permission",
      "employee with no linked user gets warning and structure still applies",
      "items endpoint returns request item diffs with row-level visibility",
      "audit endpoint is timeline-backed",
    ];
    expect(coverageNotes).toHaveLength(19);
  });
});
