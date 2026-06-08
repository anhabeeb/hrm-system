import { beforeEach, describe, expect, it, vi } from "vitest";

import * as accrualService from "../src/modules/leave/leave-accrual.service";
import type { AuthActor } from "../src/types/api.types";

vi.mock("../src/modules/leave/leave.repository", () => ({
  listEligibleEmployeesForAccrual: vi.fn(),
  listAccrualLeaveTypes: vi.fn(),
  findTransactionByIdempotencyKey: vi.fn(async () => null),
  findEmployee: vi.fn(),
  findLeaveType: vi.fn(),
  findBalance: vi.fn(async () => null),
  upsertBalance: vi.fn(async () => ({ success: true })),
  createBalanceTransaction: vi.fn(async () => ({ success: true })),
  createBalanceTransactionAndUpdateBalance: vi.fn(async () => [{ success: true }, { success: true }]),
}));

vi.mock("../src/modules/leave/leave-policy.service", () => ({
  findApplicablePolicy: vi.fn(async () => ({ entitlement_days: 12, carry_forward_days: 0, allow_negative_balance: 0 })),
}));

vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true })),
}));

import * as repository from "../src/modules/leave/leave.repository";

const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_admin",
  fullName: "Admin",
  email: "admin@example.test",
  roles: ["Admin"],
  roleKeys: ["admin"],
  permissions: ["leave.accrual.preview", "leave.accrual.apply"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const employee = (overrides = {}) => ({
  id: "emp_1",
  employee_code: "EMP001",
  full_name: "Aisha",
  employee_type: "local",
  primary_outlet_id: "outlet_1",
  department_id: "dep_1",
  position_id: "pos_1",
  employment_status: "active",
  deleted_at: null,
  date_of_joining: "2026-01-01",
  ...overrides,
});

const leaveType = (overrides = {}) => ({
  id: "leave_annual",
  company_id: "company_1",
  leave_key: "annual",
  leave_name: "Annual Leave",
  is_statutory: 0,
  is_enabled: 1,
  is_paid: 1,
  default_days: 12,
  requires_attachment: 0,
  affects_payroll: 1,
  requires_balance: 1,
  allow_negative_balance: 0,
  max_negative_balance: 0,
  accrual_enabled: 1,
  accrual_frequency: "monthly",
  annual_entitlement_days: 12,
  accrual_amount: null,
  prorate_on_joining: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.listEligibleEmployeesForAccrual).mockResolvedValue([employee() as any]);
  vi.mocked(repository.listAccrualLeaveTypes).mockResolvedValue([leaveType() as any]);
  vi.mocked(repository.findEmployee).mockResolvedValue(employee() as any);
  vi.mocked(repository.findLeaveType).mockResolvedValue(leaveType() as any);
});

describe("leave accrual service", () => {
  it("accrual preview does not write balances or transactions", async () => {
    const result = await accrualService.previewCompanyAccrual({} as Env, actor, { as_of_date: "2026-06-30" });

    expect(result.rows[0]).toMatchObject({ current_balance: 0, accrual_amount: 1, resulting_balance: 1 });
    expect(repository.upsertBalance).not.toHaveBeenCalled();
    expect(repository.createBalanceTransaction).not.toHaveBeenCalled();
  });

  it("monthly accrual applies correct amount and creates idempotent transaction", async () => {
    const result = await accrualService.applyCompanyAccrual({} as Env, actor, { as_of_date: "2026-06-30", reason: "Monthly run" });

    expect(result.summary.applied).toBe(1);
    expect(repository.createBalanceTransactionAndUpdateBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      transaction_type: "accrual",
      quantity_days: 1,
      idempotency_key: "accrual:emp_1:leave_annual:2026-06",
    }), expect.objectContaining({ accrued_days: 1 }));
  });

  it("yearly accrual applies annual entitlement", async () => {
    vi.mocked(repository.listAccrualLeaveTypes).mockResolvedValue([leaveType({ accrual_frequency: "yearly", annual_entitlement_days: 15 }) as any]);

    const result = await accrualService.previewCompanyAccrual({} as Env, actor, { as_of_date: "2026-12-31" });

    expect(result.rows[0].period_key).toBe("2026");
    expect(result.rows[0].accrual_amount).toBe(15);
  });

  it("prorates monthly accrual for mid-month joining when enabled", async () => {
    vi.mocked(repository.listEligibleEmployeesForAccrual).mockResolvedValue([employee({ date_of_joining: "2026-06-16" }) as any]);
    vi.mocked(repository.listAccrualLeaveTypes).mockResolvedValue([leaveType({ prorate_on_joining: 1, accrual_amount: 3 }) as any]);

    const result = await accrualService.previewCompanyAccrual({} as Env, actor, { as_of_date: "2026-06-30" });

    expect(result.rows[0].accrual_amount).toBe(1.5);
  });

  it("terminated employee is skipped before writing accrual", async () => {
    vi.mocked(repository.listEligibleEmployeesForAccrual).mockResolvedValue([employee({ employment_status: "terminated", termination_date: "2026-05-31" }) as any]);

    const result = await accrualService.applyCompanyAccrual({} as Env, actor, { as_of_date: "2026-06-30", reason: "Monthly run" });

    expect(result.summary.applied).toBe(0);
    expect(result.skipped[0].skipped_reason).toContain("exited");
    expect(repository.createBalanceTransaction).not.toHaveBeenCalled();
  });

  it("accrual run twice does not duplicate transactions", async () => {
    vi.mocked(repository.findTransactionByIdempotencyKey).mockResolvedValue({
      id: "tx_existing",
      company_id: "company_1",
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      balance_id: "bal_1",
      leave_request_id: null,
      transaction_type: "accrual",
      quantity_days: 1,
      balance_before: 12,
      balance_after: 13,
      effective_date: "2026-06-30",
      reason: "Monthly run",
      source: "accrual_job",
      idempotency_key: "accrual:emp_1:leave_annual:2026-06",
      created_by: "user_admin",
      created_at: "2026-06-30T00:00:00.000Z",
      metadata_json: null,
    } as any);

    const result = await accrualService.applyCompanyAccrual({} as Env, actor, { as_of_date: "2026-06-30", reason: "Monthly run" });

    expect(result.summary.applied).toBe(0);
    expect(result.summary.skipped).toBe(1);
    expect(repository.createBalanceTransaction).not.toHaveBeenCalled();
  });
});
