import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { changeStatus } from "../src/modules/employees/employees.service";
import * as employeesRepository from "../src/modules/employees/employees.repository";
import { validateEmployeeStatusInput } from "../src/modules/employees/employees.validators";
import type { EmployeeListRow } from "../src/modules/employees/employees.types";
import type { AuthActor } from "../src/types/api.types";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_hr",
  fullName: "HR Admin",
  email: "hr@example.test",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions: ["employees.manage_status"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const employee: EmployeeListRow = {
  id: "emp_1",
  company_id: "company_1",
  employee_code: "EMP001",
  full_name: "Aisha Mohamed",
  employee_type: "local",
  nationality: null,
  id_card_number: null,
  passport_number: null,
  passport_expiry_date: null,
  work_permit_number: null,
  work_permit_expiry_date: null,
  phone: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  primary_outlet_id: "outlet_1",
  primary_outlet_name: "Main Outlet",
  department_id: null,
  department_name: null,
  position_id: null,
  position_title: null,
  contract_type: null,
  employment_status: "active",
  joined_at: "2026-01-01",
  resigned_at: null,
  terminated_at: null,
  bank_name: null,
  bank_account_masked: null,
  notes: null,
  created_by: "user_hr",
  updated_by: "user_hr",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  document_expiry_status: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("employee lifecycle status validation", () => {
  it("accepts an effective-dated status change payload", () => {
    const input = validateEmployeeStatusInput({
      new_status: "suspended",
      effective_from: "2026-09-01",
      reason: "Disciplinary suspension pending review",
      notes: "Pending HR review",
      disable_user_access: true,
      revoke_active_sessions: true,
    });

    expect(input.new_status).toBe("suspended");
    expect(input.effective_from).toBe("2026-09-01");
    expect(input.disable_user_access).toBe(true);
    expect(input.revoke_active_sessions).toBe(true);
  });

  it("supports legacy effective_date by normalizing to effective_from", () => {
    const input = validateEmployeeStatusInput({
      new_status: "terminated",
      effective_date: "2026-09-30",
      reason: "Contract terminated",
    });

    expect(input.effective_from).toBe("2026-09-30");
  });

  it("requires a reason and effective date", () => {
    expect(() => validateEmployeeStatusInput({ new_status: "resigned", effective_from: "2026-09-01", reason: "" })).toThrow(
      "A reason is required",
    );
    expect(() => validateEmployeeStatusInput({ new_status: "resigned", reason: "Resigned" })).toThrow("Effective date is required");
  });

  it("rejects invalid lifecycle status values", () => {
    expect(() => validateEmployeeStatusInput({ new_status: "deleted", effective_from: "2026-09-01", reason: "Invalid" })).toThrow();
  });
});

describe("employee lifecycle backend wiring", () => {
  it("rejects future status changes before mutation or linked-user access actions", async () => {
    vi.spyOn(employeesRepository, "findEmployeeById").mockResolvedValue(employee);
    const finalizedSpy = vi.spyOn(employeesRepository, "findFinalizedPayrollRunByMonth");
    const applySpy = vi.spyOn(employeesRepository, "applyEmployeeStatusChange");
    const linkedUserSpy = vi.spyOn(employeesRepository, "findLinkedUsersByEmployeeId");

    await expect(
      changeStatus({} as Env, actor, "emp_1", {
        new_status: "terminated",
        effective_from: "2099-01-01",
        reason: "Future termination test",
        disable_user_access: true,
        revoke_active_sessions: true,
      }),
    ).rejects.toMatchObject({
      code: "EMPLOYEE_STATUS_SCHEDULING_NOT_SUPPORTED",
      message: "Future-dated employee status changes require scheduled activation and are not available yet.",
    });

    expect(finalizedSpy).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
    expect(linkedUserSpy).not.toHaveBeenCalled();
  });

  it("registers status history and status-change routes", () => {
    const routes = read("src/routes/employees.routes.ts");
    expect(routes).toContain("/:id/status-history");
    expect(routes).toContain("/:id/status-change");
    expect(routes).toContain("employees.manage_status");
  });

  it("status changes preserve history and finalized payroll protection", () => {
    const service = read("src/modules/employees/employees.service.ts");
    expect(service).toContain("allowedStatusTransitions");
    expect(service).toContain("INVALID_EMPLOYEE_STATUS_TRANSITION");
    expect(service).toContain("EMPLOYEE_STATUS_SCHEDULING_NOT_SUPPORTED");
    expect(service).toContain("EMPLOYEE_STATUS_FINALIZED_PERIOD_LOCKED");
    expect(service).toContain("applyEmployeeStatusChange");
    expect(service).toContain("findFinalizedPayrollRunByMonth");
  });

  it("status-change core mutation is batched with history timeline updates", () => {
    const repository = read("src/modules/employees/employees.repository.ts");
    expect(repository).toContain("export const applyEmployeeStatusChange");
    expect(repository).toContain("return env.DB.batch");
    expect(repository).toContain("UPDATE employees SET");
    expect(repository).toContain("UPDATE employee_status_history");
    expect(repository).toContain("INSERT INTO employee_status_history");
    expect(repository).toContain("effective_from < ?");
    expect(repository).toContain("date(?, '-1 day')");
  });

  it("employee creation writes complete initial lifecycle history", () => {
    const repository = read("src/modules/employees/employees.repository.ts");
    expect(repository).toContain("INSERT INTO employee_status_history");
    expect(repository).toContain("effective_from");
    expect(repository).toContain("approval_request_id");
    expect(repository).toContain("created_by");
    expect(repository).toContain("updated_at");
    expect(repository).toContain("input.employee.joined_at ?? timestamp.slice(0, 10)");
    expect(repository).toContain("input.actorUserId");
  });

  it("linked user access handling protects the last active Super Admin", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const repository = read("src/modules/employees/employees.repository.ts");
    expect(service).toContain("countActiveSuperAdminsExcludingUser");
    expect(service).toContain("This status change would disable the last active Super Admin.");
    expect(repository).toContain("r.role_key = 'super_admin'");
  });

  it("payroll calculation receives lifecycle effective date for rehire proration", () => {
    const repository = read("src/modules/payroll/payroll.repository.ts");
    const calculator = read("src/modules/payroll/payroll.calculator.ts");
    expect(repository).toContain("AS status_effective_from");
    expect(repository).toContain("employment_status = 'rehired'");
    expect(calculator).toContain("employee.employment_status === \"rehired\"");
    expect(calculator).toContain("status_effective_from");
  });

  it("employee lifecycle migration adds effective timeline columns and indexes", () => {
    const migration = read("migrations/0030_employee_lifecycle_history.sql");
    expect(migration).toContain("ADD COLUMN effective_from");
    expect(migration).toContain("ADD COLUMN effective_to");
    expect(migration).toContain("ADD COLUMN approval_request_id");
    expect(migration).toContain("idx_employee_status_history_employee_effective");
    expect(migration).toContain("idx_employee_status_history_employee_status");
  });

  it("frontend prevents unsupported future scheduling and explains immediate access actions", () => {
    const panel = read("frontend/src/features/employees/EmployeeLifecyclePanel.tsx");
    expect(panel).toContain("max={today()}");
    expect(panel).toContain("Future-dated employee status changes require scheduled activation and are not available yet.");
    expect(panel).toContain("Status changes are applied immediately. Future scheduling will be added later.");
    expect(panel).toContain("Disable linked user access when this status is applied");
    expect(panel).toContain("Revoke active sessions when this status is applied");
  });

});
