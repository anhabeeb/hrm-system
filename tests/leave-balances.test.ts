import { beforeEach, describe, expect, it, vi } from "vitest";

import * as balanceService from "../src/modules/leave/leave-balance.service";
import type { LeaveBalanceRecord, LeaveTypeRecord } from "../src/modules/leave/leave.types";

vi.mock("../src/modules/leave/leave.repository", () => ({
  findBalance: vi.fn(async () => null),
  findTransactionByIdempotencyKey: vi.fn(async () => null),
  createBalanceTransaction: vi.fn(async () => ({ success: true })),
  createBalanceTransactionAndUpdateBalance: vi.fn(async () => [{ success: true }, { success: true }]),
  upsertBalance: vi.fn(async () => ({ success: true })),
}));

import * as repository from "../src/modules/leave/leave.repository";

const leaveType = (overrides: Partial<LeaveTypeRecord> = {}): LeaveTypeRecord => ({
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
  accrual_amount: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const balance = (overrides: Partial<LeaveBalanceRecord> = {}): LeaveBalanceRecord => ({
  id: "bal_1",
  company_id: "company_1",
  employee_id: "emp_1",
  leave_type_id: "leave_annual",
  year: 2026,
  opening_balance: 0,
  accrued_days: 10,
  used_days: 0,
  pending_days: 0,
  adjusted_days: 0,
  carried_forward_days: 0,
  expired_days: 0,
  available_days: 10,
  entitlement_days: 12,
  remaining_days: 10,
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("leave balance ledger helpers", () => {
  it("initializes accrual-enabled balances with entitlement only as metadata", async () => {
    const result = await balanceService.initializeBalanceIfNeeded(
      {} as Env,
      "company_1",
      {
        id: "emp_1",
        employee_code: "EMP001",
        full_name: "Aisha",
        employee_type: "local",
        primary_outlet_id: "outlet_1",
        department_id: "dep_1",
        position_id: "pos_1",
        employment_status: "active",
        deleted_at: null,
      },
      "leave_annual",
      2026,
      { entitlement_days: 12, carry_forward_days: 5 } as any,
      leaveType({ accrual_enabled: 1, annual_entitlement_days: 12 }),
    );

    expect(result.entitlement_days).toBe(12);
    expect(result.accrued_days).toBe(0);
    expect(result.carried_forward_days).toBe(0);
    expect(result.available_days).toBe(0);
  });

  it("initializes non-accrual balances with upfront entitlement", async () => {
    const result = await balanceService.initializeBalanceIfNeeded(
      {} as Env,
      "company_1",
      {
        id: "emp_1",
        employee_code: "EMP001",
        full_name: "Aisha",
        employee_type: "local",
        primary_outlet_id: "outlet_1",
        department_id: "dep_1",
        position_id: "pos_1",
        employment_status: "active",
        deleted_at: null,
      },
      "leave_annual",
      2026,
      { entitlement_days: 12, carry_forward_days: 5 } as any,
      leaveType({ accrual_enabled: 0, annual_entitlement_days: 12 }),
    );

    expect(result.entitlement_days).toBe(12);
    expect(result.accrued_days).toBe(12);
    expect(result.carried_forward_days).toBe(0);
    expect(result.available_days).toBe(12);
  });

  it("opening balance creates an immutable transaction and updates available balance", async () => {
    const result = await balanceService.setOpeningBalance({} as Env, {
      balance: balance(),
      leaveType: leaveType(),
      openingBalance: 5,
      reason: "Imported opening balance",
      effectiveDate: "2026-01-01",
      actorId: "user_1",
    });

    expect(repository.createBalanceTransactionAndUpdateBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      transaction_type: "opening_balance",
      quantity_days: 5,
      balance_before: 10,
      balance_after: 15,
      idempotency_key: "opening:emp_1:leave_annual:2026:5",
    }), expect.objectContaining({
      opening_balance: 5,
      available_days: 15,
      remaining_days: 15,
    }));
    expect(result.applied).toBe(true);
  });

  it("manual adjustment requires a reason", async () => {
    await expect(balanceService.addManualAdjustment({} as Env, {
      balance: balance(),
      leaveType: leaveType(),
      adjustmentDays: 1,
      reason: "",
      effectiveDate: "2026-06-01",
      actorId: "user_1",
    })).rejects.toThrow("reason");
  });

  it("manual adjustment updates available balance correctly", async () => {
    await balanceService.addManualAdjustment({} as Env, {
      balance: balance(),
      leaveType: leaveType(),
      adjustmentDays: -2,
      reason: "Correction",
      effectiveDate: "2026-06-01",
      actorId: "user_1",
    });

    expect(repository.createBalanceTransactionAndUpdateBalance).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      adjusted_days: -2,
      available_days: 8,
    }));
  });

  it("negative balance is blocked when not allowed", async () => {
    await expect(balanceService.addManualAdjustment({} as Env, {
      balance: balance({ accrued_days: 1, available_days: 1, remaining_days: 1 }),
      leaveType: leaveType({ allow_negative_balance: 0 }),
      adjustmentDays: -2,
      reason: "Correction",
      effectiveDate: "2026-06-01",
      actorId: "user_1",
    })).rejects.toMatchObject({ code: "LEAVE_BALANCE_INSUFFICIENT" });
  });

  it("negative balance is allowed within configured max limit", async () => {
    await balanceService.addManualAdjustment({} as Env, {
      balance: balance({ accrued_days: 1, available_days: 1, remaining_days: 1 }),
      leaveType: leaveType({ allow_negative_balance: 1, max_negative_balance: 2 }),
      adjustmentDays: -2,
      reason: "Approved exception",
      effectiveDate: "2026-06-01",
      actorId: "user_1",
    });

    expect(repository.createBalanceTransactionAndUpdateBalance).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ available_days: -1 }));
  });

  it("request reserve release and used transactions are idempotent by leave request lifecycle key", async () => {
    const request = {
      id: "leave_req_1",
      company_id: "company_1",
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-02",
      total_days: 2,
      reason: "Vacation",
      status: "pending",
      created_by: "user_1",
      approval_request_id: null,
      affects_payroll: 1,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
    };

    await balanceService.reserveRequestBalance({} as Env, balance(), leaveType(), null, request, "user_1");
    await balanceService.releaseRequestBalance({} as Env, balance({ pending_days: 2, available_days: 8, remaining_days: 8 }), leaveType(), null, request, "user_1", "Rejected");
    await balanceService.useRequestBalance({} as Env, balance({ pending_days: 2, available_days: 8, remaining_days: 8 }), leaveType(), null, request, "user_1", "Approved");

    expect(repository.createBalanceTransactionAndUpdateBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ idempotency_key: "leave_request:leave_req_1:reserved" }), expect.anything());
    expect(repository.createBalanceTransactionAndUpdateBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ idempotency_key: "leave_request:leave_req_1:released" }), expect.anything());
    expect(repository.createBalanceTransactionAndUpdateBalance).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ idempotency_key: "leave_request:leave_req_1:used" }), expect.anything());
  });

  it("duplicate idempotency key returns existing transaction without mutating balance", async () => {
    vi.mocked(repository.findTransactionByIdempotencyKey).mockResolvedValueOnce({
      id: "tx_existing",
      company_id: "company_1",
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      balance_id: "bal_1",
      leave_request_id: null,
      transaction_type: "accrual",
      quantity_days: 1,
      balance_before: 10,
      balance_after: 11,
      effective_date: "2026-06-01",
      reason: null,
      source: "accrual_job",
      idempotency_key: "dup",
      created_by: null,
      created_at: "2026-06-01T00:00:00.000Z",
      metadata_json: null,
    });

    const result = await balanceService.recordBalanceTransaction({} as Env, {
      balance: balance(),
      leaveType: leaveType(),
      type: "accrual",
      quantityDays: 1,
      effectiveDate: "2026-06-01",
      source: "accrual_job",
      idempotencyKey: "dup",
      mutate: (current) => ({ ...current, accrued_days: current.accrued_days + 1 }),
    });

    expect(result.applied).toBe(false);
    expect(repository.upsertBalance).not.toHaveBeenCalled();
    expect(repository.createBalanceTransaction).not.toHaveBeenCalled();
    expect(repository.createBalanceTransactionAndUpdateBalance).not.toHaveBeenCalled();
  });

  it("duplicate transaction batch failure does not mutate aggregate balance outside the batch", async () => {
    vi.mocked(repository.createBalanceTransactionAndUpdateBalance).mockRejectedValueOnce(new Error("UNIQUE constraint failed"));
    vi.mocked(repository.findTransactionByIdempotencyKey)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "tx_existing",
        company_id: "company_1",
        employee_id: "emp_1",
        leave_type_id: "leave_annual",
        balance_id: "bal_1",
        leave_request_id: null,
        transaction_type: "accrual",
        quantity_days: 1,
        balance_before: 10,
        balance_after: 11,
        effective_date: "2026-06-01",
        reason: null,
        source: "accrual_job",
        idempotency_key: "dup-conflict",
        created_by: null,
        created_at: "2026-06-01T00:00:00.000Z",
        metadata_json: null,
      });

    const result = await balanceService.recordBalanceTransaction({} as Env, {
      balance: balance(),
      leaveType: leaveType(),
      type: "accrual",
      quantityDays: 1,
      effectiveDate: "2026-06-01",
      source: "accrual_job",
      idempotencyKey: "dup-conflict",
      mutate: (current) => ({ ...current, accrued_days: current.accrued_days + 1 }),
    });

    expect(result.applied).toBe(false);
    expect(repository.upsertBalance).not.toHaveBeenCalled();
  });

  it("duplicate idempotency returns current stored balance instead of stale input balance", async () => {
    vi.mocked(repository.findTransactionByIdempotencyKey).mockResolvedValueOnce({
      id: "tx_existing",
      company_id: "company_1",
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      balance_id: "bal_1",
      leave_request_id: null,
      transaction_type: "accrual",
      quantity_days: 1,
      balance_before: 10,
      balance_after: 11,
      effective_date: "2026-06-01",
      reason: null,
      source: "accrual_job",
      idempotency_key: "dup-current",
      created_by: null,
      created_at: "2026-06-01T00:00:00.000Z",
      metadata_json: null,
    });
    vi.mocked(repository.findBalance).mockResolvedValueOnce(balance({ accrued_days: 11, available_days: 11, remaining_days: 11 }));

    const result = await balanceService.recordBalanceTransaction({} as Env, {
      balance: balance({ accrued_days: 5, available_days: 5, remaining_days: 5 }),
      leaveType: leaveType(),
      type: "accrual",
      quantityDays: 1,
      effectiveDate: "2026-06-01",
      source: "accrual_job",
      idempotencyKey: "dup-current",
      mutate: (current) => ({ ...current, accrued_days: current.accrued_days + 1 }),
    });

    expect(result.applied).toBe(false);
    expect(result.balance.available_days).toBe(11);
  });
});
