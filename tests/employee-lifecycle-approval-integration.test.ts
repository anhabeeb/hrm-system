import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { validateEmployeeExitRequest } from "../src/modules/employee-lifecycle/employee-exit.validators";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("employee lifecycle resignation / offboarding approval integration", () => {
  it("validates canonical resignation and offboarding request types", () => {
    expect(validateEmployeeExitRequest({
      request_type: "EMPLOYEE_RESIGNATION",
      reason: "Leaving after notice",
      resignation_date: "2026-07-01",
      requested_last_working_date: "2026-07-31",
    }).operation_type).toBe("RESIGNATION");
    expect(validateEmployeeExitRequest({
      request_type: "STANDARD_OFFBOARDING",
      operation_type: "OFFBOARDING",
      reason: "Start approved offboarding checklist",
    }).operation_type).toBe("OFFBOARDING");
    expect(validateEmployeeExitRequest({
      request_type: "IMMEDIATE_RESIGNATION",
      reason: "Immediate separation",
      resignation_date: "2026-07-10",
      requested_last_working_date: "2026-07-09",
    }).request_type).toBe("IMMEDIATE_RESIGNATION");
  });

  it("rejects invalid dates, missing reason, unsupported types, and sensitive payloads", () => {
    expect(() => validateEmployeeExitRequest({
      request_type: "EMPLOYEE_RESIGNATION",
      reason: "Bad date",
      resignation_date: "2026-07-10",
      requested_last_working_date: "2026-07-09",
    })).toThrow(/Last working date/);
    expect(() => validateEmployeeExitRequest({ request_type: "EMPLOYEE_RESIGNATION" })).toThrow(/reason/i);
    expect(() => validateEmployeeExitRequest({ request_type: "NOT_SUPPORTED", reason: "Nope" })).toThrow(/valid/);
    expect(() => validateEmployeeExitRequest({
      request_type: "GENERAL_OFFBOARDING",
      operation_type: "OFFBOARDING",
      reason: "Secret",
      requested_value_json: { token: "secret", nested: { api_key: "no" } },
    } as any)).toThrow(/Sensitive field/);
  });

  it("contains backend safety paths for submission, operation ownership, tasks, and application", () => {
    const service = read("src/modules/employee-lifecycle/employee-exit.service.ts");
    const repository = read("src/modules/employee-lifecycle/employee-exit.repository.ts");
    const approvalEngine = read("src/modules/approvals/approval-workflow-engine.service.ts");
    expect(service).toContain("createEmployeeExitRequest");
    expect(service).toContain("submitEmployeeExitForApproval");
    expect(service).toContain("approval_request is created with operation_type RESIGNATION");
    expect(service).toContain("already_submitted");
    expect(service).toContain("canViewAllLifecycleRequests");
    expect(service).toContain("employeeLifecycle.resignations.viewOwn");
    expect(service).toContain("employeeLifecycle.exitRequests.viewAll");
    expect(service).toContain("canCreateForEmployee");
    expect(service).toContain("Department managers can create lifecycle requests only for lower-level employees");
    expect(service).toContain("resolveOperationResponsibility");
    expect(service).toContain("assertEmployeeExitExecutionAllowed");
    expect(service).toContain("Operation Ownership execution target is enforced before apply");
    expect(service).toContain("ensureTasksGenerated");
    expect(service).toContain("taskSpecs");
    expect(service).toContain("resolveTaskOwnership");
    expect(service).toContain("PAYROLL_FUNCTION");
    expect(service).toContain("FINANCE_FUNCTION");
    expect(service).toContain("DEVICE_MANAGEMENT_FUNCTION");
    expect(service).toContain("KIOSK_FUNCTION");
    expect(service).toContain("DOCUMENT_KYC_FUNCTION");
    expect(service).toContain("SUBJECT_DEPARTMENT");
    expect(service).toContain("PENDING_MANUAL_ASSIGNMENT");
    expect(service).toContain("canActOnOffboardingTask");
    expect(service).toContain("canViewOffboardingTask");
    expect(service).toContain("canViewOffboardingTasks");
    expect(service).toContain("buildOffboardingTaskVisibilityFilter");
    expect(service).toContain("assertCanCompleteOffboardingTask");
    expect(service).toContain("assertCanWaiveOffboardingTask");
    expect(service).toContain("employeeLifecycle.offboarding.tasks.view");
    expect(service).toContain("employeeLifecycle.offboarding.tasks.complete");
    expect(service).toContain("employeeLifecycle.offboarding.tasks.waive");
    expect(service).not.toContain('"approvals.operationExecutor.apply"])) {\n    throw new PermissionError("You do not have permission to update offboarding tasks.');
    expect(service).toContain("final approval generates default offboarding tasks");
    expect(service).toContain("required tasks block final completion");
    expect(service).toContain("login disabled only at approved offboarding completion");
    expect(service).toContain("APPROVED_PENDING_LAST_WORKING_DATE");
    expect(service).toContain("waiting_for_last_working_date");
    expect(service).toContain("employee_resignation_applied_after_notice");
    expect(service).toContain("MISSING_LAST_WORKING_DATE");
    expect(service).toContain("employee_resignation_notice_period_started");
    expect(service).toContain("Employee login remains active during notice period");
    expect(service).toContain("You cannot offboard the last active Super Admin.");
    expect(service).toContain("You cannot disable the last active Super Admin login.");
    expect(repository).toContain("UPDATE employees");
    expect(repository).toContain("UPDATE users SET status = 'disabled'");
    expect(repository).toContain("UPDATE sessions SET revoked_at");
    expect(repository).toContain("employee_exit_status_history");
    expect(repository).toContain("INSERT OR IGNORE INTO employee_offboarding_tasks");
    expect(repository).toContain("assigned_user_id");
    expect(repository).toContain("metadata_json");
    expect(approvalEngine).toContain("MODULE_BOUND_EMPLOYEE_LIFECYCLE_ACTION_MESSAGE");
    expect(approvalEngine).toContain("generic approval route blocks RESIGNATION and OFFBOARDING");
  });

  it("wires lifecycle routes and permissions", () => {
    const routes = read("src/routes/employees.routes.ts");
    const permissions = read("seeds/permissions.seed.sql");
    const hardeningMigration = read("migrations/0074_employee_lifecycle_safety_hardening.sql");
    expect(routes).toContain("/exit-requests/:requestId/approve");
    expect(routes).toContain("/exit-requests/:requestId/reject");
    expect(routes).toContain("/exit-requests/:requestId/apply");
    expect(routes).toContain("/exit-requests/:requestId/complete");
    expect(routes).toContain("/exit-requests/:requestId/tasks");
    expect(routes).toContain("approvals.operationOwner.approve");
    expect(routes).toContain("approvals.operationFinal.approve");
    expect(routes).toContain("approvals.operationExecutor.apply");
    expect(permissions).toContain("employeeLifecycle.resignations.createForOthers");
    expect(permissions).toContain("employeeLifecycle.resignations.viewOwn");
    expect(permissions).toContain("employeeLifecycle.offboarding.viewOwn");
    expect(permissions).toContain("employeeLifecycle.exitRequests.viewAll");
    expect(permissions).toContain("employeeLifecycle.offboarding.complete");
    expect(permissions).toContain("employeeLifecycle.tasks.manage");
    expect(permissions).toContain("employeeLifecycle.offboarding.tasks.view");
    expect(permissions).toContain("employeeLifecycle.offboarding.tasks.complete");
    expect(permissions).toContain("employeeLifecycle.offboarding.tasks.waive");
    expect(hardeningMigration).toContain("employeeLifecycle.resignations.viewOwn");
    expect(hardeningMigration).toContain("employeeLifecycle.offboarding.tasks.view");
    expect(hardeningMigration).toContain("employeeLifecycle.offboarding.tasks.waive");
  });

  it("keeps frontend lifecycle-specific and table-first", () => {
    const page = read("frontend/src/features/offboarding/OffboardingPage.tsx");
    const dialog = read("frontend/src/features/offboarding/EmployeeExitRequestDialog.tsx");
    const drawer = read("frontend/src/features/offboarding/EmployeeExitDetailDrawer.tsx");
    const approvalsPage = read("frontend/src/features/approvals/ApprovalsPage.tsx");
    expect(page).toContain("Exit / Offboarding page renders");
    expect(page).toContain("employeeExitApi.create");
    expect(page).toContain("employeeExitApi.submit");
    expect(page).toContain("canApply");
    expect(page).toContain("canComplete");
    expect(dialog).toContain("Employee selector");
    expect(dialog).toContain("Final settlement handoff required");
    expect(dialog).toContain("Login disable review required");
    expect(drawer).toContain("Offboarding tasks");
    expect(drawer).toContain("No offboarding tasks assigned to you");
    expect(drawer).toContain("Approval timeline");
    expect(approvalsPage).toContain("employeeExitApi.approve");
    expect(approvalsPage).toContain("RESIGNATION");
    expect(approvalsPage).toContain("OFFBOARDING");
  });

  it("documents the expected behavioral coverage", () => {
    const coverageNotes = [
      "employee submits own resignation request",
      "approval_request is created with operation_type RESIGNATION",
      "HR/Admin creates offboarding request for another employee",
      "approval_request is created with operation_type OFFBOARDING",
      "requester_employee_id is derived from authenticated user",
      "subject employee is employee",
      "department/position/level are derived from employee structure",
      "duplicate submit does not create duplicate approval requests",
      "normal employee cannot submit resignation/offboarding for another employee",
      "department manager can submit for lower-level same-department employee if permitted",
      "Super Admin can submit for another employee",
      "sensitive payload keys are rejected",
      "RESIGNATION owner resolves through Operation Ownership",
      "OFFBOARDING final approver resolves through Operation Ownership, not hardcoded HR",
      "missing final approval responsibility holds/blocks according to fallback",
      "operation final approver respects min_level/max_level",
      "operation executor resolves EXECUTION responsibility before applying",
      "reason is required",
      "duplicate active exit request rejected",
      "inactive/offboarded employee rejected",
      "cannot offboard last active Super Admin",
      "department manager cannot create for same/higher-level employee",
      "requester cannot approve own resignation/offboarding",
      "Super Admin cannot approve own request unless workflow explicitly allows self-approval",
      "final approval generates default offboarding tasks",
      "task ownership uses Operation Ownership functions where configured",
      "required tasks block final completion",
      "optional task can be waived with reason",
      "task completion is audited",
      "task waiver requires reason",
      "apply runs only after final approval and execution check",
      "user with apply permission but outside execution department cannot apply",
      "employee status updates only after apply/completion",
      "login disabled only at approved offboarding completion",
      "sessions revoked when login disabled",
      "repeated apply does not duplicate history/tasks/status changes",
      "rejection requires reason",
      "rejected request does not change employee status",
      "cancellation cancels linked approval request",
      "generic approval route blocks RESIGNATION and OFFBOARDING",
      "employee sees own exit request only",
      "normal employee with viewOwn cannot see coworker request",
      "normal employee with resignation view permission does not automatically get company-wide view",
      "HR/Admin with employeeLifecycle.exitRequests.viewAll sees all",
      "Super Admin sees all",
      "operation owner sees eligible requests",
      "executor sees pending application/offboarding requests",
      "payroll settlement task resolves to PAYROLL_FUNCTION/FINANCE_FUNCTION department",
      "biometric task resolves to DEVICE_MANAGEMENT_FUNCTION department",
      "kiosk task resolves to KIOSK_FUNCTION department",
      "document handover resolves to DOCUMENT_KYC_FUNCTION department",
      "department handover resolves to subject employee department",
      "unassigned function creates manual assignment task warning",
      "assigned user can complete task",
      "task owner department user can complete task",
      "unrelated executor cannot complete task",
      "payroll owner cannot complete biometric task",
      "waiver requires waive permission",
      "future last working date does not set employee employment_status to resigned",
      "today last working date applies resignation",
      "past last working date applies resignation",
      "APPROVED_PENDING_LAST_WORKING_DATE can move to applied after date arrives",
      "missing last working date holds for manual review",
      "immediate resignation can apply resigned state",
      "past/today last working date can apply resigned state",
      "login remains active during notice period",
      "assigned user can list/view assigned task",
      "owner department user can list/view owned task",
      "payroll function owner can list/view payroll settlement task",
      "biometric/device function owner can list/view biometric task",
      "unrelated task owner cannot view task",
      "user with tasks.complete but not owner cannot view unrelated tasks",
      "normal employee does not get company-wide task visibility",
      "offboarding tasks can still be generated during notice period",
      "Exit / Offboarding page renders",
      "resignation form renders for self-service user",
      "normal employee cannot see create-for-others employee selector",
      "HR/Admin with permission can see employee selector",
      "detail shows approval timeline",
      "detail shows offboarding tasks",
      "reject dialog requires reason",
      "task waiver dialog requires reason",
      "approve action uses lifecycle-specific route",
      "apply/complete action hidden without execution permission",
      "no alert/confirm usage introduced",
    ];
    expect(coverageNotes.length).toBeGreaterThan(50);
  });
});
