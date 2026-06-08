import { afterEach, describe, expect, it, vi } from "vitest";

import { countInclusiveDays } from "../src/modules/leave/leave-calendar.service";
import * as leaveService from "../src/modules/leave/leave.service";
import * as leaveRepository from "../src/modules/leave/leave.repository";
import * as settingsService from "../src/services/settings.service";
import * as auditService from "../src/services/audit.service";
import * as holidayService from "../src/modules/holidays/holidays.service";
import * as balanceService from "../src/modules/leave/leave-balance.service";
import * as policyService from "../src/modules/leave/leave-policy.service";
import type { AuthActor } from "../src/types/api.types";
import type { LeaveBalanceRecord, LeaveBalanceTransactionRecord, LeaveRequestRecord, LeaveTypeRecord } from "../src/modules/leave/leave.types";
import {
  validateBalanceAdjust,
  validateLeaveRequestCreate,
  validateLeaveTypeUpdate,
} from "../src/modules/leave/leave.validators";
import { ValidationError } from "../src/utils/errors";

afterEach(() => vi.restoreAllMocks());

describe("leave validators and helpers", () => {
  it("counts inclusive leave days", () => {
    expect(countInclusiveDays("2026-06-01", "2026-06-05")).toBe(5);
  });

  it("rejects invalid leave date ranges", () => {
    expect(() =>
      validateLeaveRequestCreate({
        employee_id: "emp_1",
        leave_type_id: "leave_annual",
        start_date: "2026-06-05",
        end_date: "2026-06-01",
      }),
    ).toThrow(ValidationError);
  });

  it("requires reason for leave type updates", () => {
    expect(() => validateLeaveTypeUpdate({ is_enabled: false })).toThrow(ValidationError);
  });

  it("requires reason for balance adjustments", () => {
    expect(() =>
      validateBalanceAdjust({
        leave_type_id: "leave_annual",
        year: 2026,
        adjustment_days: 2,
      }),
    ).toThrow(ValidationError);
  });
});

describe("leave module behavior", () => {
  it("validates accrual and carry-forward leave type fields", () => {
    expect(validateLeaveTypeUpdate({
      accrual_enabled: true,
      accrual_frequency: "monthly",
      annual_entitlement_days: 12,
      accrual_amount: 1,
      carry_forward_enabled: true,
      carry_forward_limit_days: 5,
      reason: "Enable accrual settings",
    })).toMatchObject({
      accrual_enabled: true,
      accrual_frequency: "monthly",
      annual_entitlement_days: 12,
      accrual_amount: 1,
      carry_forward_enabled: true,
      carry_forward_limit_days: 5,
    });
  });

  it("rejects invalid accrual frequency", () => {
    expect(() => validateLeaveTypeUpdate({
      accrual_frequency: "weekly-ish",
      reason: "Bad frequency",
    })).toThrow(ValidationError);
  });

  it("rejects invalid carry-forward expiry date parts", () => {
    expect(() => validateLeaveTypeUpdate({
      carry_forward_expiry_month: 13,
      carry_forward_expiry_day: 40,
      reason: "Bad expiry",
    })).toThrow(ValidationError);
  });
});

describe("leave balance atomic repository helpers", () => {
  const balance: LeaveBalanceRecord = {
    id: "bal_1",
    company_id: "company_1",
    employee_id: "emp_1",
    leave_type_id: "leave_annual",
    year: 2026,
    opening_balance: 0,
    accrued_days: 1,
    used_days: 0,
    pending_days: 0,
    adjusted_days: 0,
    carried_forward_days: 0,
    expired_days: 0,
    available_days: 1,
    entitlement_days: 12,
    remaining_days: 1,
    updated_at: "2026-06-01T00:00:00.000Z",
  };
  const transaction: LeaveBalanceTransactionRecord = {
    id: "tx_1",
    company_id: "company_1",
    employee_id: "emp_1",
    leave_type_id: "leave_annual",
    balance_id: "bal_1",
    leave_request_id: null,
    transaction_type: "accrual",
    quantity_days: 1,
    balance_before: 0,
    balance_after: 1,
    effective_date: "2026-06-01",
    reason: "Monthly accrual",
    source: "accrual_job",
    idempotency_key: "accrual:emp_1:leave_annual:2026-06",
    created_by: "user_1",
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

  it("batches ledger insert and aggregate update together", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.createBalanceTransactionAndUpdateBalance(env, transaction, balance);

    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain("INSERT INTO leave_balance_transactions");
    expect(statements[1].sql).toContain("INSERT INTO leave_balances");
  });

  it("batches leave request creation with balance transaction", async () => {
    const { env, statements } = fakeEnv();

    await leaveRepository.createLeaveRequestWithBalanceTransaction(env, {
      id: "leave_req_1",
      company_id: "company_1",
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-01",
      total_days: 1,
      reason: "Leave",
      status: "pending",
      created_by: "user_1",
      approval_request_id: null,
      affects_payroll: 1,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
    }, { transaction, balance });

    expect(statements).toHaveLength(3);
    expect(statements[0].sql).toContain("INSERT INTO leave_requests");
    expect(statements[1].sql).toContain("INSERT INTO leave_balance_transactions");
    expect(statements[2].sql).toContain("INSERT INTO leave_balances");
  });
});

describe("holiday-aware leave request behavior", () => {
  const actor: AuthActor = {
    companyId: "company_1",
    actorUserId: "user_hr",
    fullName: "HR Admin",
    email: "hr@example.test",
    roles: ["HR Admin"],
    roleKeys: ["hr_admin"],
    permissions: ["leave.create", "leave.view"],
    outletIds: ["outlet_1"],
    isSuperAdmin: false,
    isAdmin: true,
    ipAddress: null,
    userAgent: null,
  };

  const employee = {
    id: "emp_1",
    employee_code: "EMP001",
    full_name: "Foreign Employee",
    employee_type: "foreign",
    primary_outlet_id: "outlet_1",
    department_id: "dept_1",
    position_id: "pos_1",
    employment_status: "active",
    deleted_at: null,
    date_of_joining: "2025-01-01",
    hire_date: null,
    joined_at: null,
    exit_date: null,
    termination_date: null,
  };

  const leaveType: LeaveTypeRecord = {
    id: "leave_annual",
    company_id: "company_1",
    leave_key: "annual",
    leave_name: "Annual Leave",
    is_statutory: 0,
    is_enabled: 1,
    is_paid: 1,
    default_days: 12,
    requires_attachment: 0,
    affects_payroll: 0,
    requires_balance: 1,
    created_at: "",
    updated_at: "",
  };

  const balance = {
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
    updated_at: "",
  };

  const fakeEnv = (options: { excludePaid?: number; recurring?: boolean; localOnly?: boolean; outletId?: string; departmentId?: string } = {}) => ({
    DB: {
      prepare: (sql: string) => ({
        bind: (..._values: unknown[]) => ({
          first: async () => {
            if (sql.includes("FROM employees WHERE")) return employee;
            if (sql.includes("FROM holiday_settings")) {
              return {
                holiday_module_enabled: 1,
                public_holidays_enabled: 1,
                company_holidays_enabled: 1,
                outlet_specific_holidays_enabled: 1,
                optional_holidays_enabled: 1,
                other_holidays_enabled: 1,
                holiday_leave_rules_enabled: 1,
                holidays_exclude_from_paid_leave: options.excludePaid ?? 1,
                holidays_exclude_from_unpaid_leave: 0,
                exclude_holidays_from_leave: 0,
              };
            }
            return null;
          },
          all: async () => {
            if (sql.includes("FROM holidays h")) {
              return {
                results: [{
                  id: "holiday_1",
                  company_id: "company_1",
                  name: "Recurring Foreign Outlet Holiday",
                  holiday_type: "company_holiday",
                  date: options.recurring ? "2025-06-03" : "2026-06-03",
                  start_date: options.recurring ? "2025-06-03" : "2026-06-03",
                  end_date: null,
                  is_recurring: options.recurring ? 1 : 0,
                  recurrence_month: 6,
                  recurrence_day: 3,
                  outlet_id: options.outletId ?? "outlet_1",
                  department_id: options.departmentId ?? "dept_1",
                  applies_to_all_outlets: 0,
                  applies_to_local_employees: options.localOnly ? 1 : 0,
                  applies_to_foreign_employees: options.localOnly ? 0 : 1,
                  paid_holiday: 1,
                  counts_as_working_day: 0,
                  affects_leave_duration: 1,
                  affects_attendance_absence: 1,
                  affects_overtime: 1,
                  affects_long_leave_payroll: 1,
                  status: "active",
                  is_enabled: 1,
                  source: "manual",
                  created_at: "",
                  updated_at: "",
                }],
              };
            }
            return { results: [] };
          },
          run: async () => ({ success: true }),
        }),
      }),
      batch: async (batched: unknown[]) => batched,
    },
  }) as unknown as Env;

  const stubCreateRequest = () => {
    let capturedRequest: LeaveRequestRecord | null = null;
    let capturedQuantity = 0;
    vi.spyOn(leaveRepository, "findEmployee").mockResolvedValue(employee as any);
    vi.spyOn(leaveRepository, "findLeaveType").mockResolvedValue(leaveType);
    vi.spyOn(leaveRepository, "findOverlappingRequest").mockResolvedValue(null);
    vi.spyOn(policyService, "findApplicablePolicy").mockResolvedValue(null);
    vi.spyOn(balanceService, "initializeBalanceIfNeeded").mockResolvedValue(balance);
    vi.spyOn(settingsService, "shouldRequireApproval").mockResolvedValue(true);
    vi.spyOn(settingsService, "isFeatureEnabled").mockResolvedValue(false);
    vi.spyOn(auditService, "createAuditLog").mockResolvedValue({ created: true } as any);
    vi.spyOn(leaveRepository, "findApprovalWorkflow").mockResolvedValue({ id: "workflow_1", is_enabled: 1 } as any);
    vi.spyOn(leaveRepository, "listWorkflowSteps").mockResolvedValue([
      { step_order: 1, approver_role_key: "hr_admin", required_permission_key: "leave.approvals.approve", approval_type: "single" },
    ] as any);
    vi.spyOn(leaveRepository, "createLeaveRequestWithApprovalWorkflow").mockImplementation(async (_env, request, _approval, _steps, entry) => {
      capturedRequest = request;
      capturedQuantity = entry?.transaction.quantity_days ?? 0;
      return [] as any;
    });
    vi.spyOn(leaveRepository, "findRequest").mockImplementation(async () => capturedRequest as any);
    return { get request() { return capturedRequest; }, get quantity() { return capturedQuantity; } };
  };

  it("actual leave request create/reservation excludes holiday from balance deduction when policy says exclude", async () => {
    const captured = stubCreateRequest();
    const result = await leaveService.createRequest(fakeEnv({ excludePaid: 1, recurring: true }), actor, {
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-05",
      reason: "Annual leave around holiday",
    });
    expect(result.leave_request?.total_days).toBe(4);
    expect(captured.quantity).toBe(4);
  });

  it("actual leave request includes holiday when policy says include", async () => {
    const captured = stubCreateRequest();
    const result = await leaveService.createRequest(fakeEnv({ excludePaid: 0, recurring: true }), actor, {
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-05",
      reason: "Annual leave including holiday",
    });
    expect(result.leave_request?.total_days).toBe(5);
    expect(captured.quantity).toBe(5);
  });

  it("local/foreign outlet and department applicability affects real leave request duration", async () => {
    stubCreateRequest();
    const localOnly = await leaveService.createRequest(fakeEnv({ excludePaid: 1, localOnly: true }), actor, {
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-05",
      reason: "Foreign employee should not receive local holiday exclusion",
    });
    expect(localOnly.leave_request?.total_days).toBe(5);

    stubCreateRequest();
    const wrongDepartment = await leaveService.createRequest(fakeEnv({ excludePaid: 1, departmentId: "dept_2" }), actor, {
      employee_id: "emp_1",
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-05",
      reason: "Different department holiday",
    });
    expect(wrongDepartment.leave_request?.total_days).toBe(5);
  });
});

