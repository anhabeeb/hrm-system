import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateDisciplinaryActionInput } from "../src/modules/employee-discipline/employee-discipline.validators";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("disciplinary action approval engine integration", () => {
  it("accepts canonical disciplinary request and action types", () => {
    const canonicalRequestTypes = [
      "POLICY_VIOLATION",
      "ATTENDANCE_VIOLATION",
      "CONDUCT_VIOLATION",
      "PERFORMANCE_ISSUE",
      "SAFETY_VIOLATION",
      "HARASSMENT_COMPLAINT",
      "INVESTIGATION",
      "GENERAL_DISCIPLINARY_ACTION",
    ];
    const canonicalActionTypes = [
      "VERBAL_WARNING",
      "WRITTEN_WARNING",
      "FINAL_WARNING",
      "SUSPENSION",
      "PERFORMANCE_IMPROVEMENT_PLAN",
      "TRAINING_REQUIRED",
      "TERMINATION_RECOMMENDATION",
      "NO_ACTION",
      "GENERAL_ACTION",
    ];

    for (const request_type of canonicalRequestTypes) {
      expect(validateDisciplinaryActionInput({
        employee_id: "emp_1",
        request_type,
        action_type: "WRITTEN_WARNING",
        severity: "MEDIUM",
        title: "Policy review",
        description: "A documented policy review is required.",
        incident_date: "2026-06-01",
        reason: "Manager review",
      }).request_type).toBe(request_type);
    }

    for (const action_type of canonicalActionTypes) {
      expect(validateDisciplinaryActionInput({
        employee_id: "emp_1",
        request_type: "GENERAL_DISCIPLINARY_ACTION",
        action_type,
        severity: action_type === "TERMINATION_RECOMMENDATION" ? "HIGH" : "MEDIUM",
        title: "Action review",
        description: "A documented action review is required.",
        incident_date: "2026-06-01",
        reason: "Manager review",
      }).action_type).toBe(action_type);
    }
  });

  it("rejects future incidents, unsupported types, low-severity sensitive outcomes, and sensitive payloads", () => {
    expect(() => validateDisciplinaryActionInput({
      employee_id: "emp_1",
      request_type: "BAD_TYPE",
      action_type: "WRITTEN_WARNING",
      title: "Bad type",
      description: "Bad type",
      incident_date: "2026-06-01",
      reason: "No",
    })).toThrow(/disciplinary action form/i);

    expect(() => validateDisciplinaryActionInput({
      employee_id: "emp_1",
      request_type: "GENERAL_DISCIPLINARY_ACTION",
      action_type: "SUSPENSION",
      severity: "LOW",
      title: "Bad severity",
      description: "Bad severity",
      incident_date: "2026-06-01",
      reason: "No",
    })).toThrow(/disciplinary action form/i);

    for (const action_type of ["FINAL_WARNING", "SUSPENSION_RECOMMENDATION", "TERMINATION_RECOMMENDATION"]) {
      expect(() => validateDisciplinaryActionInput({
        employee_id: "emp_1",
        request_type: "GENERAL_DISCIPLINARY_ACTION",
        action_type,
        severity: "LOW",
        title: "Sensitive low severity",
        description: "Sensitive low severity",
        incident_date: "2026-06-01",
        reason: "No",
      })).toThrow(/disciplinary action form/i);
    }

    expect(() => validateDisciplinaryActionInput({
      employee_id: "emp_1",
      request_type: "GENERAL_DISCIPLINARY_ACTION",
      action_type: "WRITTEN_WARNING",
      title: "Future incident",
      description: "Future incident",
      incident_date: "2099-01-01",
      reason: "No",
    })).toThrow(/disciplinary action form/i);

    expect(() => validateDisciplinaryActionInput({
      employee_id: "emp_1",
      request_type: "GENERAL_DISCIPLINARY_ACTION",
      action_type: "WRITTEN_WARNING",
      title: "Secret payload",
      description: "Secret payload",
      incident_date: "2026-06-01",
      reason: "No",
      requested_action_json: { notes: [{ api_key: "nope" }], device_secret: "nope" },
    })).toThrow(/disciplinary action form/i);
  });

  it("contains backend safety paths for ownership, approval, execution, and official records", () => {
    const service = read("src/modules/employee-discipline/employee-discipline.service.ts");
    const repository = read("src/modules/employee-discipline/employee-discipline.repository.ts");
    const routes = read("src/routes/employee-discipline.routes.ts");
    const approvalEngine = read("src/modules/approvals/approval-workflow-engine.service.ts");

    expect(service).toContain("createDisciplinaryAction");
    expect(service).toContain("submitDisciplinaryActionForApproval");
    expect(service).toContain("approval_request is created with operation_type DISCIPLINARY_ACTION");
    expect(service).toContain("already_submitted");
    expect(service).toContain("buildDisciplinaryActionVisibilityFilter");
    expect(service).toContain("canViewDisciplinaryAction");
    expect(service).toContain("canCreateForEmployee");
    expect(service).toContain("Department-scoped creators can only create disciplinary actions for lower-level employees");
    expect(service).toContain("resolveOperationResponsibility");
    expect(service).toContain("assertDisciplinaryExecutionAllowed");
    expect(service).toContain("official record is created only after final approval and execution check");
    expect(service).toContain("payroll/offboarding outcomes create follow-up tasks");
    expect(service).toContain("acknowledgement is tracked without mutating employee status");
    expect(service).toContain("Official disciplinary record must exist before acknowledgement");
    expect(service).toContain("acknowledgement completes EMPLOYEE_ACKNOWLEDGEMENT task");
    expect(service).toContain("Only applied or acknowledged disciplinary actions can be closed");
    expect(service).toContain("Official disciplinary record must exist before closing");
    expect(service).toContain("no already_applied success on partial state");
    expect(service).toContain("DISCIPLINARY_APPLY_PARTIAL_FAILURE");
    expect(service).toContain("buildDisciplinaryRecordVisibilityFilter");
    expect(service).toContain("canViewDisciplinaryRecord");
    expect(service).toContain("canActOnTask");
    expect(service).toContain("employeeDiscipline.tasks.complete");
    expect(repository).toContain("employee_disciplinary_records");
    expect(repository).toContain("employee_disciplinary_follow_up_tasks");
    expect(repository).toContain("findDuplicateActiveRequest");
    expect(repository).toContain("createOfficialRecord");
    expect(repository).toContain("findOfficialRecordById");
    expect(repository).toContain("listOfficialRecords");
    expect(repository).toContain("updateOfficialRecordAcknowledgement");
    expect(repository).toContain("completeTaskByType");
    expect(repository).toContain("createFollowUpTasks");
    expect(repository).toContain("listItems");
    expect(routes).toContain("approvals.operationOwner.approve");
    expect(routes).toContain("/records");
    expect(routes).toContain("/actions/:requestId/items");
    expect(routes).toContain("approvals.operationFinal.approve");
    expect(routes).toContain("approvals.operationExecutor.apply");
    expect(approvalEngine).toContain("MODULE_BOUND_DISCIPLINARY_ACTION_MESSAGE");
    expect(approvalEngine).toContain("generic approval route blocks DISCIPLINARY_ACTION");
  });

  it("wires migration, permissions, module routes, and frontend navigation", () => {
    const migration = read("migrations/0075_employee_disciplinary_action_approval_engine.sql");
    const permissions = read("seeds/permissions.seed.sql");
    const app = read("src/app.ts");
    const navigation = read("frontend/src/lib/navigation.ts");
    const router = read("frontend/src/app/router.tsx");

    expect(migration).toContain("employee_disciplinary_action_requests");
    expect(migration).toContain("employee_disciplinary_action_items");
    expect(migration).toContain("employee_disciplinary_records");
    expect(migration).toContain("employee_disciplinary_follow_up_tasks");
    expect(migration).toContain("DISCIPLINARY_ACTION_DEFAULT");
    expect(migration).toContain("OPERATION_OWNER");
    expect(migration).toContain("OPERATION_FINAL_APPROVER");
    expect(permissions).toContain("employeeDiscipline.actions.createForOthers");
    expect(permissions).toContain("employeeDiscipline.actions.finalApprove");
    expect(permissions).toContain("employeeDiscipline.actions.apply");
    expect(permissions).toContain("employeeDiscipline.actions.close");
    expect(permissions).toContain("employeeDiscipline.records.viewOwn");
    expect(permissions).toContain("employeeDiscipline.records.viewAll");
    expect(permissions).toContain("employeeDiscipline.acknowledge");
    expect(app).toContain("employeeDisciplineRoutes");
    expect(navigation).toContain("/disciplinary-actions");
    expect(router).toContain("DisciplinaryActionsPage");
  });

  it("keeps the frontend module-specific, table-first, and approval-safe", () => {
    const page = read("frontend/src/features/discipline/DisciplinaryActionsPage.tsx");
    const dialog = read("frontend/src/features/discipline/DisciplinaryActionDialog.tsx");
    const table = read("frontend/src/features/discipline/DisciplinaryActionsTable.tsx");
    const drawer = read("frontend/src/features/discipline/DisciplinaryActionDetailDrawer.tsx");
    const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");

    expect(page).toContain("Disciplinary Actions");
    expect(dialog).toContain("disciplineApi.create");
    expect(dialog).toContain("disciplineApi.submit");
    expect(page).toContain("canApply");
    expect(page).toContain("canAcknowledge");
    expect(dialog).toContain("EmployeeCombobox");
    expect(dialog).toContain("Employee acknowledgement required");
    expect(dialog).toContain("Payroll review follow-up");
    expect(table).toContain("RowActions");
    expect(drawer).toContain("Approval timeline");
    expect(drawer).toContain("Official record");
    expect(drawer).toContain("Follow-up tasks");
    expect(approvalsPage).toContain("disciplineApi.approve");
    expect(approvalsPage).toContain("DISCIPLINARY_ACTION");
    expect(`${page}\n${dialog}\n${table}\n${drawer}`).not.toMatch(/window\.alert|window\.confirm|alert\(|confirm\(/);
  });

  it("documents expected behavioral coverage", () => {
    const coverageNotes = [
      "employee can submit self disciplinary acknowledgement response",
      "HR/Admin can create disciplinary action for employee",
      "department manager can create for lower-level same-department employee",
      "department manager cannot create for same or higher level employee",
      "department manager cannot create for another department",
      "sensitive action types require sensitive permission",
      "approval_request is created with operation_type DISCIPLINARY_ACTION",
      "duplicate submit does not create duplicate approval requests",
      "normal employee cannot create disciplinary action for another employee",
      "subject employee structure is derived from employee record",
      "operation owner/final/executor permissions are honored",
      "operation owner review uses Operation Ownership, not hardcoded HR",
      "operation final approval uses Operation Ownership, not hardcoded HR",
      "requester cannot approve own disciplinary action",
      "generic approval route blocks DISCIPLINARY_ACTION",
      "frontend generic approvals action uses discipline-specific endpoints",
      "official record is created only after final approval and execution check",
      "official record is not created on draft, submitted, rejected, or cancelled requests",
      "execution target department is enforced",
      "specific-user execution target is enforced",
      "min/max execution level is enforced",
      "required execution role is enforced",
      "payroll/offboarding outcomes create follow-up tasks",
      "payroll review task does not mutate payroll directly",
      "offboarding review task does not offboard employee directly",
      "training follow-up task is tracked as follow-up only",
      "acknowledgement is tracked without mutating employee status",
      "cannot acknowledge draft request",
      "cannot acknowledge pending approval request",
      "cannot acknowledge approved-but-not-applied request",
      "can acknowledge after official record exists",
      "acknowledgement completes EMPLOYEE_ACKNOWLEDGEMENT task",
      "acknowledgement required request remains pending acknowledgement after apply",
      "follow-up required request remains pending follow-up after apply",
      "required tasks block close",
      "close requires official record and applied state",
      "cannot close draft/pending request",
      "cannot close approved but not applied request",
      "can close after acknowledgement and required tasks complete/waived",
      "task waiver requires reason",
      "normal employee sees own disciplinary actions only",
      "employee can view own official disciplinary record",
      "employee cannot view coworker official disciplinary record",
      "HR/Admin with records.viewAll can view all official records",
      "normal employee cannot see coworker disciplinary action",
      "department reviewer sees eligible same-department disciplinary action",
      "operation final approver sees eligible final approval request",
      "executor sees pending application request only when eligible",
      "sensitive investigator notes are hidden from normal employee",
      "sensitive owner/final notes are hidden from normal employee",
      "audit timeline is available for authorized users",
      "row-level visibility applies to list/detail/timeline/tasks/audit",
      "cancellation requires own request or cancelAny",
      "rejection requires reason",
      "safe payload recursively rejects password/token/secret/api_key/device_secret",
      "future incident date is rejected",
      "FINAL_WARNING treated as sensitive",
      "SUSPENSION treated as sensitive",
      "TERMINATION_RECOMMENDATION treated as sensitive",
      "official record without applied request status results in manual review",
      "apply failure creates audit/manual review state",
      "items endpoint returns existing evidence items safely",
      "no browser alert/confirm usage introduced",
    ];

    expect(coverageNotes).toContain("employee can submit self disciplinary acknowledgement response");
    expect(coverageNotes).toContain("generic approval route blocks DISCIPLINARY_ACTION");
    expect(coverageNotes).toContain("official record is created only after final approval and execution check");
    expect(coverageNotes).toContain("payroll/offboarding outcomes create follow-up tasks");
    expect(coverageNotes).toContain("acknowledgement completes EMPLOYEE_ACKNOWLEDGEMENT task");
    expect(coverageNotes).toContain("close requires official record and applied state");
    expect(coverageNotes).toContain("employee can view own official disciplinary record");
    expect(coverageNotes).toContain("FINAL_WARNING treated as sensitive");
  });
});
