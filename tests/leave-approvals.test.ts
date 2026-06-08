import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as leaveRepository from "../src/modules/leave/leave.repository";
import { assertApprovalStepActionable } from "../src/modules/leave/leave.service";
import type { LeaveApprovalStepRecord, LeaveBalanceRecord, LeaveBalanceTransactionRecord, LeaveRequestRecord } from "../src/modules/leave/leave.types";
import type { AuthActor } from "../src/types/api.types";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Phase 9B leave approval workflow guards", () => {
  it("approval routes expose inbox, history, timeline, and action endpoints", () => {
    const routes = read("src/routes/leave.routes.ts");

    for (const route of [
      '"/approvals/inbox"',
      '"/approvals/history"',
      '"/approvals/:requestId"',
      '"/requests/:requestId/timeline"',
      '"/requests/:id/submit"',
      '"/requests/:id/approve"',
      '"/requests/:id/reject"',
      '"/requests/:id/cancel"',
      '"/requests/:id/withdraw"',
      '"/requests/:id/delegate"',
      '"/requests/:id/escalate"',
    ]) {
      expect(routes).toContain(route);
    }
  });

  it("submit creates approval workflow records in the same request and balance batch", () => {
    const service = read("src/modules/leave/leave.service.ts");
    const repository = read("src/modules/leave/leave.repository.ts");

    expect(service).toContain("buildLeaveApprovalWorkflowIfRequired");
    expect(service).toContain("createLeaveRequestWithApprovalWorkflow");
    expect(repository).toContain("prepareCreateApprovalRequest");
    expect(repository).toContain("prepareCreateApprovalStep");
    expect(repository).toContain("prepareCreateBalanceTransaction");
    expect(repository).toContain("prepareUpsertBalance");
  });

  it("approval, rejection, cancellation, and withdrawal use Phase 9A atomic balance helpers", () => {
    const service = read("src/modules/leave/leave.service.ts");

    expect(service).toContain("updateLeaveApprovalStepAndRequestStatus");
    expect(service).toContain("updateLeaveRequestStatusWithBalanceTransaction");
    expect(service).toContain("planReleasePendingBalance");
    expect(service).toContain("leave_request:${request.id}:used");
    expect(service).toContain("released");
    expect(service).toContain("withdrawn_released");
    expect(service).toContain("leave_request:${request.id}:cancel_used_reversal");
  });

  it("invalid approval transitions and self approval are blocked", () => {
    const service = read("src/modules/leave/leave.service.ts");

    expect(service).toContain("LEAVE_APPROVAL_INVALID_TRANSITION");
    expect(service).toContain("LEAVE_APPROVER_NOT_AUTHORIZED");
    expect(service).toContain("You cannot approve your own leave request.");
    expect(service).toContain("LEAVE_APPROVAL_STEP_NOT_PENDING");
    expect(service).toContain("actorHasRoleKey");
    expect(service).toContain("Only the delegated approver can act");
    expect(service).toContain("Outlet managers can only approve employees in their outlet scope.");
    expect(service).toContain("A reason is required for Super Admin approval override.");
  });

  it("frontend has approval inbox, settings, and timeline surfaces", () => {
    const page = read("frontend/src/features/leave/LeavePage.tsx");
    const inbox = read("frontend/src/features/leave/LeaveApprovalInboxTable.tsx");
    const timeline = read("frontend/src/features/leave/LeaveApprovalTimelineDialog.tsx");
    const settings = read("frontend/src/features/leave/LeaveApprovalSettingsPanel.tsx");

    expect(page).toContain('TabsTrigger value="approvals"');
    expect(page).toContain('TabsTrigger value="approval-history"');
    expect(page).toContain('TabsTrigger value="approval-settings"');
    expect(inbox).toContain("Approve");
    expect(inbox).toContain("Reject");
    expect(inbox).toContain("Delegate");
    expect(timeline).toContain("approval_steps");
    expect(timeline).toContain("balance_transactions");
    expect(settings).toContain("Balance-safe lifecycle");
    expect(settings).toContain("Approval steps");
    expect(settings).toContain("Add approval step");
    expect(settings).toContain("Create approval step");
    expect(settings).toContain("Update approval step");
    expect(settings).toContain("approvalsApi.createStep");
    expect(settings).toContain("approvalsApi.updateStep");
    expect(settings).toContain("approvalsApi.deleteStep");
    expect(settings).toContain("workflow is enabled but has no approval steps");
    expect(settings).toContain("Multi-level mode has fewer than two steps");
    expect(settings).toContain("Duplicate step order");
    expect(settings).toContain("has no role and no permission requirement");
    expect(settings).toContain("Save workflow settings");
    expect(settings).toContain("approvalsApi.updateWorkflow");
    expect(settings).not.toContain("First approval role");
    expect(settings).not.toContain("disabled>Workflow editor");
  });

  it("new Phase 9B permissions are seeded and route-enforced", () => {
    const permissions = read("seeds/permissions.seed.sql");
    const roles = read("seeds/roles.seed.sql");
    const routes = read("src/routes/leave.routes.ts");
    const approvalRoutes = read("src/routes/approvals.routes.ts");

    const seededPermissions = [
      "leave.requests.submit",
      "leave.requests.create_for_employee",
      "leave.requests.cancel",
      "leave.requests.withdraw",
      "leave.requests.override",
      "leave.approvals.view",
      "leave.approvals.approve",
      "leave.approvals.reject",
      "leave.approvals.delegate",
      "leave.approvals.escalate",
      "leave.approvals.override",
      "leave.approvals.settings.manage",
      "leave.timeline.view",
    ];
    for (const permission of seededPermissions) {
      expect(permissions).toContain(permission);
      expect(roles).toContain(permission);
    }
    for (const permission of seededPermissions) {
      expect(`${routes}\n${approvalRoutes}`).toContain(permission);
    }
  });
});

describe("Phase 9B leave approval repository batches", () => {
  const request: LeaveRequestRecord = {
    id: "leave_req_1",
    company_id: "company_1",
    employee_id: "emp_1",
    leave_type_id: "leave_annual",
    start_date: "2026-06-01",
    end_date: "2026-06-02",
    total_days: 2,
    reason: "Family leave",
    status: "pending_approval",
    created_by: "user_employee",
    approval_request_id: "approval_req_1",
    approval_status: "pending",
    submitted_at: "2026-06-01T00:00:00.000Z",
    submitted_by: "user_employee",
    affects_payroll: 1,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
  const step: LeaveApprovalStepRecord = {
    id: "leave_step_1",
    company_id: "company_1",
    leave_request_id: "leave_req_1",
    step_order: 1,
    approver_type: "role",
    approver_user_id: null,
    approver_role_id: null,
    approver_role_key: "hr_admin",
    required_permission_key: "leave.approve",
    status: "pending",
    decision_by: null,
    decision_at: null,
    decision_note: null,
    delegated_to: null,
    delegated_by: null,
    delegated_at: null,
    due_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
  const balance: LeaveBalanceRecord = {
    id: "bal_1",
    company_id: "company_1",
    employee_id: "emp_1",
    leave_type_id: "leave_annual",
    year: 2026,
    opening_balance: 0,
    accrued_days: 10,
    used_days: 0,
    pending_days: 2,
    adjusted_days: 0,
    carried_forward_days: 0,
    expired_days: 0,
    available_days: 8,
    entitlement_days: 12,
    remaining_days: 8,
    updated_at: "2026-06-01T00:00:00.000Z",
  };
  const transaction: LeaveBalanceTransactionRecord = {
    id: "tx_1",
    company_id: "company_1",
    employee_id: "emp_1",
    leave_type_id: "leave_annual",
    balance_id: "bal_1",
    leave_request_id: "leave_req_1",
    transaction_type: "request_reserved",
    quantity_days: 2,
    balance_before: 10,
    balance_after: 8,
    effective_date: "2026-06-01",
    reason: "Family leave",
    source: "leave_request",
    idempotency_key: "leave_request:leave_req_1:reserved",
    created_by: "user_employee",
    created_at: "2026-06-01T00:00:00.000Z",
    metadata_json: null,
  };

  const fakeEnv = () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    return {
      statements,
      env: {
        DB: {
          prepare: (sql: string) => ({
            bind: (...values: unknown[]) => {
              const statement = { sql, values, run: async () => ({ success: true }) };
              statements.push(statement);
              return statement;
            },
          }),
          batch: async (batched: unknown[]) => batched,
        },
      } as unknown as Env,
    };
  };

  it("batches request creation, generic approval, approval steps, ledger insert, and balance update", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.createLeaveRequestWithApprovalWorkflow(env, request, {
      id: "approval_req_1",
      companyId: "company_1",
      workflowId: "workflow_leave_request",
      module: "leave",
      entityType: "leave_request",
      entityId: "leave_req_1",
      employeeId: "emp_1",
      requestedBy: "user_employee",
      summary: "Leave request needs approval.",
      payloadJson: "{}",
    }, [step], { transaction, balance });

    expect(statements.map((statement) => statement.sql).join("\n")).toContain("INSERT INTO leave_requests");
    expect(statements.map((statement) => statement.sql).join("\n")).toContain("INSERT INTO approval_requests");
    expect(statements.map((statement) => statement.sql).join("\n")).toContain("INSERT INTO leave_approval_steps");
    expect(statements.map((statement) => statement.sql).join("\n")).toContain("WHERE NOT EXISTS");
    expect(statements.map((statement) => statement.sql).join("\n")).toContain("INSERT INTO leave_balance_transactions");
    expect(statements.map((statement) => statement.sql).join("\n")).toContain("INSERT INTO leave_balances");
  });

  it("draft submit batches request status, generic approval, approval steps, ledger insert, and balance update", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.submitLeaveRequestWithApprovalWorkflow(env, "company_1", "leave_req_1", {
      status: "pending_approval",
      approval_status: "pending",
      approval_request_id: "approval_req_1",
      submitted_by: "user_employee",
      submitted_at: "2026-06-01T00:00:00.000Z",
    }, {
      id: "approval_req_1",
      companyId: "company_1",
      workflowId: "workflow_leave_request",
      module: "leave",
      entityType: "leave_request",
      entityId: "leave_req_1",
      employeeId: "emp_1",
      requestedBy: "user_employee",
      summary: "Leave request needs approval.",
      payloadJson: "{}",
    }, [step], { transaction, balance });

    const sql = statements.map((statement) => statement.sql).join("\n");
    expect(statements[0].sql).toContain("UPDATE leave_requests");
    expect(sql).toContain("INSERT INTO approval_requests");
    expect(sql).toContain("INSERT INTO leave_approval_steps");
    expect(sql).toContain("INSERT INTO leave_balance_transactions");
    expect(sql).toContain("INSERT INTO leave_balances");
  });

  it("batches approval step decision, request status update, generic approval sync, ledger insert, and balance update", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.updateLeaveApprovalStepAndRequestStatus(
      env,
      "company_1",
      "leave_req_1",
      "leave_step_1",
      { status: "approved", decision_by: "user_hr", decision_at: "2026-06-01T01:00:00.000Z", decision_note: "Approved" },
      { status: "approved", approval_status: "approved", approved_by: "user_hr", approved_at: "2026-06-01T01:00:00.000Z" },
      { transaction: { ...transaction, transaction_type: "leave_used", idempotency_key: "leave_request:leave_req_1:used" }, balance: { ...balance, used_days: 2, pending_days: 0 } },
      { id: "approval_req_1", status: "approved", current_step: 1 },
    );

    expect(statements[0].sql).toContain("UPDATE leave_approval_steps");
    expect(statements[1].sql).toContain("UPDATE leave_requests");
    expect(statements[2].sql).toContain("UPDATE approval_requests");
    expect(statements[3].sql).toContain("INSERT INTO leave_balance_transactions");
    expect(statements[4].sql).toContain("INSERT INTO leave_balances");
  });

  it("syncs generic approval requests on reject, cancel, and withdraw status batches", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.updateLeaveRequestStatusWithBalanceTransaction(
      env,
      "company_1",
      "leave_req_1",
      { status: "withdrawn", approval_status: "withdrawn" },
      { transaction: { ...transaction, transaction_type: "request_released", idempotency_key: "leave_request:leave_req_1:withdrawn_released" }, balance: { ...balance, pending_days: 0 } },
      { id: "approval_req_1", status: "withdrawn", current_step: null },
    );

    expect(statements[0].sql).toContain("UPDATE leave_requests");
    expect(statements[1].sql).toContain("UPDATE approval_requests");
    expect(statements[1].values).toContain("withdrawn");
    expect(statements[2].sql).toContain("INSERT INTO leave_balance_transactions");
  });

  it("submit with approvals disabled auto-approves and moves balance to used", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.updateLeaveRequestStatusWithBalanceTransaction(
      env,
      "company_1",
      "leave_req_1",
      { status: "approved", approval_status: "approved", approved_by: "user_hr", approved_at: "2026-06-01T01:00:00.000Z" },
      {
        transaction: { ...transaction, transaction_type: "leave_used", idempotency_key: "leave_request:leave_req_1:used" },
        balance: { ...balance, pending_days: 0, used_days: 2, available_days: 8 },
      },
      { id: "approval_req_1", status: "approved", current_step: null },
    );

    expect(statements[0].values).toContain("approved");
    expect(statements[1].sql).toContain("UPDATE approval_requests");
    expect(statements[1].values).toContain("approved");
    expect(statements[2].values).toContain("leave_used");
    expect(statements[2].values).toContain("leave_request:leave_req_1:used");
  });

  it("first-level approval marks the step approved and advances the generic approval request", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.updateLeaveApprovalStepAndRequestStatus(
      env,
      "company_1",
      "leave_req_1",
      "leave_step_1",
      { status: "approved", decision_by: "user_manager", decision_at: "2026-06-01T01:00:00.000Z", decision_note: "Manager approved" },
      { status: "partially_approved", approval_status: "partially_approved" },
      null,
      { id: "approval_req_1", status: "pending", current_step: 2 },
    );

    expect(statements[0].sql).toContain("UPDATE leave_approval_steps");
    expect(statements[0].values).toContain("approved");
    expect(statements[1].values).toContain("partially_approved");
    expect(statements[2].sql).toContain("UPDATE approval_requests");
    expect(statements[2].values).toContain(2);
  });

  it("final approval moves pending balance to used and marks generic approval request approved", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.updateLeaveApprovalStepAndRequestStatus(
      env,
      "company_1",
      "leave_req_1",
      "leave_step_2",
      { status: "approved", decision_by: "user_hr", decision_at: "2026-06-01T02:00:00.000Z", decision_note: "Final approved" },
      { status: "approved", approval_status: "approved", approved_by: "user_hr", approved_at: "2026-06-01T02:00:00.000Z" },
      {
        transaction: { ...transaction, transaction_type: "leave_used", idempotency_key: "leave_request:leave_req_1:used" },
        balance: { ...balance, pending_days: 0, used_days: 2 },
      },
      { id: "approval_req_1", status: "approved", current_step: 2 },
    );

    expect(statements[1].values).toContain("approved");
    expect(statements[2].values).toContain("approved");
    expect(statements[3].values).toContain("leave_used");
    expect(statements[3].values).toContain("leave_request:leave_req_1:used");
  });

  it("rejection releases pending balance and marks generic approval request rejected", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.updateLeaveApprovalStepAndRequestStatus(
      env,
      "company_1",
      "leave_req_1",
      "leave_step_1",
      { status: "rejected", decision_by: "user_hr", decision_at: "2026-06-01T01:00:00.000Z", decision_note: "Insufficient cover" },
      { status: "rejected", approval_status: "rejected", rejected_by: "user_hr", rejected_at: "2026-06-01T01:00:00.000Z", decision_reason: "Insufficient cover" },
      {
        transaction: { ...transaction, transaction_type: "request_released", idempotency_key: "leave_request:leave_req_1:rejected_released" },
        balance: { ...balance, pending_days: 0, available_days: 10 },
      },
      { id: "approval_req_1", status: "rejected", current_step: 1 },
    );

    expect(statements[0].values).toContain("rejected");
    expect(statements[1].values).toContain("rejected");
    expect(statements[2].values).toContain("rejected");
    expect(statements[3].values).toContain("request_released");
    expect(statements[3].values).toContain("leave_request:leave_req_1:rejected_released");
  });

  it("cancellation of approved leave reverses used balance and closes generic approval request", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.updateLeaveRequestStatusWithBalanceTransaction(
      env,
      "company_1",
      "leave_req_1",
      { status: "cancelled", approval_status: "cancelled", cancelled_by: "user_hr", cancelled_at: "2026-06-03T01:00:00.000Z" },
      {
        transaction: { ...transaction, transaction_type: "reversal", idempotency_key: "leave_request:leave_req_1:cancel_used_reversal", quantity_days: -2 },
        balance: { ...balance, pending_days: 0, used_days: 0, available_days: 10 },
      },
      { id: "approval_req_1", status: "cancelled", current_step: null },
    );

    expect(statements[0].values).toContain("cancelled");
    expect(statements[1].values).toContain("cancelled");
    expect(statements[2].values).toContain("reversal");
    expect(statements[2].values).toContain("leave_request:leave_req_1:cancel_used_reversal");
  });

  it("repeated lifecycle operations carry stable idempotency keys instead of creating transition-specific variants", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.updateLeaveRequestStatusWithBalanceTransaction(
      env,
      "company_1",
      "leave_req_1",
      { status: "withdrawn", approval_status: "withdrawn" },
      { transaction: { ...transaction, id: "tx_repeat_1", idempotency_key: "leave_request:leave_req_1:withdrawn_released" }, balance },
      { id: "approval_req_1", status: "withdrawn", current_step: null },
    );
    await leaveRepository.updateLeaveRequestStatusWithBalanceTransaction(
      env,
      "company_1",
      "leave_req_1",
      { status: "withdrawn", approval_status: "withdrawn" },
      { transaction: { ...transaction, id: "tx_repeat_2", idempotency_key: "leave_request:leave_req_1:withdrawn_released" }, balance },
      { id: "approval_req_1", status: "withdrawn", current_step: null },
    );

    const idempotencyValues = statements.flatMap((statement) => statement.values).filter((value) => value === "leave_request:leave_req_1:withdrawn_released");
    expect(idempotencyValues).toHaveLength(2);
  });
});

describe("Phase 9B approver authorization behavior", () => {
  const request: LeaveRequestRecord = {
    id: "leave_req_auth",
    company_id: "company_1",
    employee_id: "emp_auth",
    leave_type_id: "leave_annual",
    start_date: "2026-06-10",
    end_date: "2026-06-10",
    total_days: 1,
    reason: "Medical appointment",
    status: "pending_approval",
    created_by: "user_employee",
    approval_request_id: "approval_auth",
    approval_status: "pending",
    submitted_at: "2026-06-09T00:00:00.000Z",
    submitted_by: "user_employee",
    affects_payroll: 1,
    created_at: "2026-06-09T00:00:00.000Z",
    updated_at: "2026-06-09T00:00:00.000Z",
  };

  const baseStep: LeaveApprovalStepRecord = {
    id: "step_auth_1",
    company_id: "company_1",
    leave_request_id: "leave_req_auth",
    step_order: 1,
    approver_type: "role",
    approver_user_id: null,
    approver_role_id: null,
    approver_role_key: "hr_admin",
    required_permission_key: "leave.approvals.approve",
    status: "pending",
    decision_by: null,
    decision_at: null,
    decision_note: null,
    delegated_to: null,
    delegated_by: null,
    delegated_at: null,
    due_at: null,
    created_at: "2026-06-09T00:00:00.000Z",
    updated_at: "2026-06-09T00:00:00.000Z",
  };

  const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
    companyId: "company_1",
    actorUserId: "user_hr",
    fullName: "HR User",
    email: "hr@example.test",
    roles: ["HR"],
    roleKeys: ["hr_admin"],
    permissions: ["leave.approvals.approve"],
    outletIds: ["outlet_1"],
    isSuperAdmin: false,
    isAdmin: false,
    ipAddress: null,
    userAgent: null,
    ...overrides,
  });

  const authEnv = (options: {
    step?: LeaveApprovalStepRecord | null;
    employeeOutlet?: string | null;
    employeeDepartment?: string | null;
    actorStatus?: string;
    actorActive?: number;
    roleMatch?: boolean;
  } = {}) => {
    const step = options.step === undefined ? baseStep : options.step;
    const employee = {
      id: "emp_auth",
      employee_code: "EMP-9B",
      full_name: "Leave Employee",
      employee_type: "local",
      primary_outlet_id: options.employeeOutlet ?? "outlet_1",
      department_id: options.employeeDepartment ?? "dept_1",
      position_id: "pos_1",
      employment_status: "active",
      deleted_at: null,
      date_of_joining: "2026-01-01",
      hire_date: null,
      joined_at: null,
      exit_date: null,
      termination_date: null,
    };
    return {
      DB: {
        prepare: (sql: string) => ({
          bind: (...values: unknown[]) => ({
            first: async () => {
              if (sql.includes("FROM users WHERE")) {
                return {
                  id: values[1],
                  company_id: values[0],
                  status: options.actorStatus ?? "active",
                  is_active: options.actorActive ?? 1,
                  email: "approver@example.test",
                  full_name: "Approver",
                };
              }
              if (sql.includes("FROM leave_approval_steps")) return step;
              if (sql.includes("FROM employees WHERE")) return employee;
              if (sql.includes("FROM user_roles")) return { total: options.roleMatch === false ? 0 : 1 };
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
        }),
        batch: async (statements: unknown[]) => statements,
      },
    } as unknown as Env;
  };

  it("assigned user can approve assigned step and assigned-user restriction blocks other users", async () => {
    const assignedStep = { ...baseStep, approver_user_id: "user_assigned" };

    await expect(assertApprovalStepActionable(
      authEnv({ step: assignedStep }),
      actor({ actorUserId: "user_assigned" }),
      request,
      "Assigned approver decision",
    )).resolves.toMatchObject({ id: "step_auth_1" });

    await expect(assertApprovalStepActionable(
      authEnv({ step: assignedStep }),
      actor({ actorUserId: "user_other" }),
      request,
      "Wrong assigned approver",
    )).rejects.toMatchObject({ code: "LEAVE_APPROVER_NOT_AUTHORIZED" });
  });

  it("delegated user can approve delegated step and non-delegated user cannot", async () => {
    const delegatedStep = { ...baseStep, delegated_to: "user_delegate", status: "delegated" };

    await expect(assertApprovalStepActionable(
      authEnv({ step: delegatedStep }),
      actor({ actorUserId: "user_delegate" }),
      request,
      "Delegated approver decision",
    )).resolves.toMatchObject({ delegated_to: "user_delegate" });

    await expect(assertApprovalStepActionable(
      authEnv({ step: delegatedStep }),
      actor({ actorUserId: "user_other" }),
      request,
      "Not delegated",
    )).rejects.toMatchObject({ code: "LEAVE_APPROVER_NOT_AUTHORIZED" });
  });

  it("user with permission but wrong approver_role_key cannot approve role-specific step", async () => {
    await expect(assertApprovalStepActionable(
      authEnv({ roleMatch: false }),
      actor({ roleKeys: ["payroll_admin"], permissions: ["leave.approvals.approve"] }),
      request,
      "Permission alone is not enough",
    )).rejects.toMatchObject({ code: "LEAVE_APPROVER_NOT_AUTHORIZED" });
  });

  it("outlet manager cannot approve outside outlet scope but can approve inside outlet scope", async () => {
    const outletStep = { ...baseStep, approver_type: "outlet_manager", approver_role_key: "outlet_manager" };
    const outletActor = actor({ roleKeys: ["outlet_manager"], permissions: ["leave.approvals.approve"], outletIds: ["outlet_1"] });

    await expect(assertApprovalStepActionable(
      authEnv({ step: outletStep, employeeOutlet: "outlet_2" }),
      outletActor,
      request,
      "Outside outlet",
    )).rejects.toMatchObject({ code: "OUTLET_ACCESS_DENIED" });

    await expect(assertApprovalStepActionable(
      authEnv({ step: outletStep, employeeOutlet: "outlet_1" }),
      outletActor,
      request,
      "Inside outlet",
    )).resolves.toMatchObject({ approver_type: "outlet_manager" });
  });

  it("department manager behavior is constrained to department_manager role because AuthActor has no department scope list", async () => {
    const departmentStep = { ...baseStep, approver_type: "department_manager", approver_role_key: "department_manager" };

    await expect(assertApprovalStepActionable(
      authEnv({ step: departmentStep }),
      actor({ roleKeys: ["hr_admin"], permissions: ["leave.approvals.approve"] }),
      request,
      "Wrong department role",
    )).rejects.toMatchObject({ code: "LEAVE_APPROVER_NOT_AUTHORIZED" });

    await expect(assertApprovalStepActionable(
      authEnv({ step: departmentStep }),
      actor({ roleKeys: ["department_manager"], permissions: ["leave.approvals.approve"] }),
      request,
      "Department manager role",
    )).resolves.toMatchObject({ approver_type: "department_manager" });
  });

  it("inactive user cannot approve", async () => {
    await expect(assertApprovalStepActionable(
      authEnv({ actorStatus: "suspended", actorActive: 0 }),
      actor(),
      request,
      "Inactive approver",
    )).rejects.toMatchObject({ code: "LEAVE_APPROVER_NOT_AUTHORIZED" });
  });

  it("employee cannot approve own request", async () => {
    await expect(assertApprovalStepActionable(
      authEnv(),
      actor({ actorUserId: "user_employee" }),
      request,
      "Own request",
    )).rejects.toMatchObject({ code: "LEAVE_APPROVER_NOT_AUTHORIZED" });
  });

  it("Super Admin override requires reason before acting", async () => {
    await expect(assertApprovalStepActionable(
      authEnv(),
      actor({ roleKeys: ["super_admin"], permissions: ["leave.approvals.override"], isSuperAdmin: true, actorUserId: "super_admin" }),
      request,
      "",
    )).rejects.toMatchObject({ code: "LEAVE_APPROVAL_REASON_REQUIRED" });
  });

  it("invalid transition is rejected before approval checks", async () => {
    await expect(assertApprovalStepActionable(
      authEnv(),
      actor(),
      { ...request, status: "approved" },
      "Too late",
    )).rejects.toMatchObject({ code: "LEAVE_APPROVAL_INVALID_TRANSITION" });
  });
});
