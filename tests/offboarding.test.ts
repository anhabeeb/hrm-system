import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true })),
}));

import { createAuditLog } from "../src/services/audit.service";
import * as repository from "../src/modules/offboarding/offboarding.repository";
import { completeTask, prepareFinalSettlement, startCase } from "../src/modules/offboarding/offboarding.service";
import { validateOffboardingStartInput } from "../src/modules/offboarding/offboarding.validators";
import type { AuthActor } from "../src/types/api.types";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const context: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_hr",
  fullName: "HR Admin",
  email: "hr@example.test",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions: [
    "employees.view",
    "employees.offboarding.view",
    "employees.offboarding.manage",
    "employees.offboarding.complete_task",
    "employees.offboarding.final_settlement",
  ],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const employee = {
  id: "emp_1",
  company_id: "company_1",
  employee_code: "EMP001",
  full_name: "Aisha Mohamed",
  employee_type: "foreign",
  primary_outlet_id: "outlet_1",
  outlet_name: "Main",
  department_id: "dept_1",
  employment_status: "resigned",
  joined_at: "2026-01-01",
  deleted_at: null,
};

const offboardingCase = {
  id: "off_case_1",
  company_id: "company_1",
  employee_id: "emp_1",
  status: "in_progress",
  offboarding_type: "resignation",
  effective_exit_date: "2026-09-30",
  reason: "Employee resigned",
  initiated_at: "2026-09-01T00:00:00.000Z",
  final_settlement_status: "not_prepared",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(createAuditLog).mockClear();
});

const stubEmployeeAccess = () => {
  vi.spyOn(repository, "findEmployee").mockResolvedValue(employee as any);
  vi.spyOn(repository, "findFinalizedPayrollRunByMonth").mockResolvedValue(null);
};

const stubCaseDetail = () => {
  vi.spyOn(repository, "findCaseById").mockResolvedValue(offboardingCase as any);
  vi.spyOn(repository, "listTasks").mockResolvedValue([]);
  vi.spyOn(repository, "getSettlementDraft").mockResolvedValue(null);
};

describe("offboarding validation and schema", () => {
  it("validates start offboarding input", () => {
    const input = validateOffboardingStartInput({
      offboarding_type: "termination",
      effective_exit_date: "2026-09-30",
      reason: "Terminated",
    });

    expect(input.create_default_tasks).toBe(true);
    expect(input.offboarding_type).toBe("termination");
  });

  it("schema migration creates cases, tasks, settlement drafts, and indexes", () => {
    const migration = read("migrations/0031_employee_offboarding.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS employee_offboarding_cases");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS employee_offboarding_tasks");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS employee_final_settlement_drafts");
    expect(migration).toContain("idx_offboarding_cases_company_employee_status");
    expect(migration).toContain("idx_final_settlement_drafts_case");
  });

  it("registers employee-scoped and global offboarding routes", () => {
    expect(read("src/routes/employees.routes.ts")).toContain("/:id/offboarding/start");
    expect(read("src/routes/employees.routes.ts")).toContain("/:id/offboarding/:caseId/prepare-final-settlement");
    expect(read("src/app.ts")).toContain('apiV1.route("/offboarding-cases", offboardingRoutes)');
  });
});

describe("offboarding service behavior", () => {
  it("starts offboarding and generates default tasks from existing records", async () => {
    stubEmployeeAccess();
    stubCaseDetail();
    vi.spyOn(repository, "findActiveCaseForEmployee").mockResolvedValue(null);
    vi.spyOn(repository, "createCase").mockResolvedValue({ success: true } as any);
    vi.spyOn(repository, "listLinkedUsers").mockResolvedValue([{ id: "user_1", company_id: "company_1", employee_id: "emp_1", status: "active", full_name: "Aisha" }]);
    vi.spyOn(repository, "listPendingAssetAssignments").mockResolvedValue([{ id: "assign_1", asset_code: "LAP01", asset_name: "Laptop" }]);
    vi.spyOn(repository, "listPendingUniformIssues").mockResolvedValue([{ id: "uni_1", uniform_type: "shirt", quantity: 2, issued_date: "2026-01-01" }]);
    vi.spyOn(repository, "listOutstandingAdvances").mockResolvedValue([{ id: "adv_1", amount: 1000, repaid_amount: 0 }]);
    vi.spyOn(repository, "listOutstandingLoans").mockResolvedValue([{ id: "loan_1", outstanding_amount: 2000 }]);
    vi.spyOn(repository, "listPendingLeaveAfterExit").mockResolvedValue([{ id: "leave_1" }]);
    vi.spyOn(repository, "listLeaveBalances").mockResolvedValue([{ id: "balance_1" }]);
    vi.spyOn(repository, "listEmployeeDocuments").mockResolvedValue([{ id: "doc_1" }]);
    const upsertTask = vi.spyOn(repository, "upsertTask").mockResolvedValue({ success: true } as any);

    const result = await startCase({} as Env, context, "emp_1", {
      offboarding_type: "resignation",
      effective_exit_date: "2026-09-30",
      reason: "Employee resigned",
      create_default_tasks: true,
    });

    expect(result.case.id).toBe("off_case_1");
    expect(upsertTask).toHaveBeenCalled();
    expect(upsertTask.mock.calls.map((call) => call[1].task.taskType)).toEqual(expect.arrayContaining([
      "revoke_user_access",
      "return_asset",
      "return_uniform",
      "clear_salary_advance",
      "clear_salary_loan",
      "final_payroll_review",
    ]));
  });

  it("rejects duplicate active offboarding case", async () => {
    stubEmployeeAccess();
    vi.spyOn(repository, "findActiveCaseForEmployee").mockResolvedValue(offboardingCase as any);
    const createCase = vi.spyOn(repository, "createCase");

    await expect(startCase({} as Env, context, "emp_1", {
      offboarding_type: "resignation",
      effective_exit_date: "2026-09-30",
      reason: "Duplicate",
      create_default_tasks: true,
    })).rejects.toMatchObject({ code: "OFFBOARDING_CASE_ALREADY_ACTIVE" });
    expect(createCase).not.toHaveBeenCalled();
  });

  it("blocks offboarding exit dates in finalized payroll periods", async () => {
    vi.spyOn(repository, "findEmployee").mockResolvedValue(employee as any);
    vi.spyOn(repository, "findFinalizedPayrollRunByMonth").mockResolvedValue({ id: "pay_1", status: "finalized" });
    const createCase = vi.spyOn(repository, "createCase");

    await expect(startCase({} as Env, context, "emp_1", {
      offboarding_type: "resignation",
      effective_exit_date: "2026-09-30",
      reason: "Locked period",
      create_default_tasks: true,
    })).rejects.toMatchObject({ code: "RECORD_LOCKED" });
    expect(createCase).not.toHaveBeenCalled();
  });

  it("final settlement draft does not mark advances or loans paid", async () => {
    stubEmployeeAccess();
    stubCaseDetail();
    vi.spyOn(repository, "findLatestFinalizedPayrollMonth").mockResolvedValue(null);
    vi.spyOn(repository, "findLatestSalary").mockResolvedValue({ id: "sal_1", monthly_salary_amount: 900000, currency: "MVR" });
    vi.spyOn(repository, "listActiveCompensationComponents").mockResolvedValue([]);
    vi.spyOn(repository, "sumUnpaidLeaveDays").mockResolvedValue(1);
    vi.spyOn(repository, "countAbsentDays").mockResolvedValue(1);
    vi.spyOn(repository, "listOutstandingAdvances").mockResolvedValue([{ id: "adv_1", amount: 100000, repaid_amount: 25000 }]);
    vi.spyOn(repository, "listOutstandingLoans").mockResolvedValue([{ id: "loan_1", outstanding_amount: 50000 }]);
    vi.spyOn(repository, "sumOpenAssetDeductions").mockResolvedValue(10000);
    const upsertSettlementDraft = vi.spyOn(repository, "upsertSettlementDraft").mockResolvedValue({ success: true } as any);
    vi.spyOn(repository, "updateCaseSettlementStatus").mockResolvedValue({ success: true } as any);

    await prepareFinalSettlement({} as Env, context, "emp_1", "off_case_1", { reason: "Preparing draft" });

    const draft = upsertSettlementDraft.mock.calls[0]?.[1];
    expect(draft?.advances_outstanding).toBe(75000);
    expect(draft?.loans_outstanding).toBe(50000);
    expect(read("src/modules/offboarding/offboarding.service.ts")).not.toContain("UPDATE advance_payments");
    expect(read("src/modules/offboarding/offboarding.service.ts")).not.toContain("UPDATE salary_loans");
  });

  const stubPendingRevokeTask = () => {
    stubEmployeeAccess();
    vi.spyOn(repository, "findCaseById").mockResolvedValue(offboardingCase as any);
    vi.spyOn(repository, "findTaskById").mockResolvedValue({
      id: "task_1",
      company_id: "company_1",
      offboarding_case_id: "off_case_1",
      employee_id: "emp_1",
      task_type: "revoke_user_access",
      title: "Disable linked user access",
      status: "pending",
      required: 1,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    } as any);
    vi.spyOn(repository, "listTasks").mockResolvedValue([]);
    vi.spyOn(repository, "getSettlementDraft").mockResolvedValue(null);
  };

  it("revoke user access task cannot disable the last active Super Admin", async () => {
    stubPendingRevokeTask();
    vi.spyOn(repository, "listLinkedUsers").mockResolvedValue([
      { id: "user_normal", company_id: "company_1", employee_id: "emp_1", status: "active", full_name: "Normal User" },
      { id: "user_super", company_id: "company_1", employee_id: "emp_1", status: "active", full_name: "Super Admin" },
    ]);
    vi.spyOn(repository, "countActiveSuperAdmins").mockResolvedValue(1);
    vi.spyOn(repository, "listActiveSuperAdminIdsForUsers").mockResolvedValue(["user_super"]);
    const completeRevokeUserAccessTask = vi.spyOn(repository, "completeRevokeUserAccessTask");
    const completeTaskMutation = vi.spyOn(repository, "completeTask");

    await expect(completeTask({} as Env, context, "emp_1", "off_case_1", "task_1", { reason: "Exit clearance" }))
      .rejects.toMatchObject({ code: "LAST_SUPER_ADMIN_PROTECTED" });
    expect(completeRevokeUserAccessTask).not.toHaveBeenCalled();
    expect(completeTaskMutation).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_TASK_COMPLETED" }));
  });

  it("revoke user access prevalidation prevents partial session revocation and leaves task pending", async () => {
    stubPendingRevokeTask();
    vi.spyOn(repository, "listLinkedUsers").mockResolvedValue([
      { id: "user_first", company_id: "company_1", employee_id: "emp_1", status: "active", full_name: "First User" },
      { id: "user_super", company_id: "company_1", employee_id: "emp_1", status: "active", full_name: "Super Admin" },
    ]);
    vi.spyOn(repository, "countActiveSuperAdmins").mockResolvedValue(1);
    vi.spyOn(repository, "listActiveSuperAdminIdsForUsers").mockResolvedValue(["user_super"]);
    const completeRevokeUserAccessTask = vi.spyOn(repository, "completeRevokeUserAccessTask");

    await expect(completeTask({} as Env, context, "emp_1", "off_case_1", "task_1", { reason: "Exit clearance" }))
      .rejects.toMatchObject({ code: "LAST_SUPER_ADMIN_PROTECTED" });
    expect(completeRevokeUserAccessTask).not.toHaveBeenCalled();
  });

  it("revoke user access task disables all linked users, revokes sessions, and completes task after validation", async () => {
    stubPendingRevokeTask();
    vi.spyOn(repository, "listLinkedUsers").mockResolvedValue([
      { id: "user_normal", company_id: "company_1", employee_id: "emp_1", status: "active", full_name: "Normal User" },
      { id: "user_super", company_id: "company_1", employee_id: "emp_1", status: "active", full_name: "Super Admin" },
    ]);
    vi.spyOn(repository, "countActiveSuperAdmins").mockResolvedValue(2);
    vi.spyOn(repository, "listActiveSuperAdminIdsForUsers").mockResolvedValue(["user_super"]);
    const completeRevokeUserAccessTask = vi.spyOn(repository, "completeRevokeUserAccessTask").mockResolvedValue([] as any);

    await completeTask({} as Env, context, "emp_1", "off_case_1", "task_1", { reason: "Exit clearance" });

    expect(completeRevokeUserAccessTask).toHaveBeenCalledWith(
      expect.anything(),
      "company_1",
      "task_1",
      "user_hr",
      ["user_normal", "user_super"],
      "Exit clearance",
    );
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_USER_ACCESS_DISABLED", details: { user_id: "user_normal" } }));
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_USER_SESSIONS_REVOKED", details: { user_id: "user_normal" } }));
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_USER_ACCESS_DISABLED", details: { user_id: "user_super" } }));
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_USER_SESSIONS_REVOKED", details: { user_id: "user_super" } }));
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_TASK_COMPLETED" }));
  });

  it("already completed revoke user access task is idempotent", async () => {
    stubEmployeeAccess();
    vi.spyOn(repository, "findCaseById").mockResolvedValue(offboardingCase as any);
    vi.spyOn(repository, "findTaskById").mockResolvedValue({
      id: "task_1",
      company_id: "company_1",
      offboarding_case_id: "off_case_1",
      employee_id: "emp_1",
      task_type: "revoke_user_access",
      title: "Disable linked user access",
      status: "completed",
      required: 1,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    } as any);
    vi.spyOn(repository, "listTasks").mockResolvedValue([]);
    vi.spyOn(repository, "getSettlementDraft").mockResolvedValue(null);
    const completeRevokeUserAccessTask = vi.spyOn(repository, "completeRevokeUserAccessTask");

    await completeTask({} as Env, context, "emp_1", "off_case_1", "task_1", { reason: "Retry" });

    expect(completeRevokeUserAccessTask).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("already disabled linked users are skipped and task is completed safely", async () => {
    stubPendingRevokeTask();
    vi.spyOn(repository, "listLinkedUsers").mockResolvedValue([
      { id: "user_disabled", company_id: "company_1", employee_id: "emp_1", status: "disabled", full_name: "Disabled User" },
    ]);
    const completeRevokeUserAccessTask = vi.spyOn(repository, "completeRevokeUserAccessTask").mockResolvedValue([] as any);

    await completeTask({} as Env, context, "emp_1", "off_case_1", "task_1", { reason: "Exit clearance" });

    expect(completeRevokeUserAccessTask).toHaveBeenCalledWith(expect.anything(), "company_1", "task_1", "user_hr", [], "Exit clearance");
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_TASK_COMPLETED" }));
    expect(createAuditLog).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_USER_ACCESS_DISABLED" }));
  });

  it("no linked users case completes revoke task safely", async () => {
    stubPendingRevokeTask();
    vi.spyOn(repository, "listLinkedUsers").mockResolvedValue([]);
    const completeRevokeUserAccessTask = vi.spyOn(repository, "completeRevokeUserAccessTask").mockResolvedValue([] as any);

    await completeTask({} as Env, context, "emp_1", "off_case_1", "task_1", {});

    expect(completeRevokeUserAccessTask).toHaveBeenCalledWith(
      expect.anything(),
      "company_1",
      "task_1",
      "user_hr",
      [],
      "No linked users found or all linked users are already disabled.",
    );
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_TASK_COMPLETED" }));
    expect(createAuditLog).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "OFFBOARDING_USER_SESSIONS_REVOKED" }));
  });

  it("revoke user access uses one core batch before success audit events", () => {
    const service = read("src/modules/offboarding/offboarding.service.ts");
    const repo = read("src/modules/offboarding/offboarding.repository.ts");
    expect(service.indexOf("await repository.completeRevokeUserAccessTask")).toBeLessThan(service.indexOf("await auditRevokeUserAccessTask"));
    expect(repo).toContain("return env.DB.batch(statements)");
  });

  it("task generation is idempotent through unique task source and INSERT OR IGNORE", () => {
    const migration = read("migrations/0031_employee_offboarding.sql");
    const repo = read("src/modules/offboarding/offboarding.repository.ts");
    expect(migration).toContain("UNIQUE(company_id, offboarding_case_id, task_type, source_type, source_id)");
    expect(repo).toContain("INSERT OR IGNORE INTO employee_offboarding_tasks");
  });
});
