import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  calculateLongLeavePayrollPreview,
  calculatePayableAmount,
  countInclusiveDays,
  getPayrollMonthRange,
  getMonthOverlap,
  monthEndDate,
  monthsBetween,
} from "../src/modules/long-leave/long-leave-calculator.service";
import * as longLeaveService from "../src/modules/long-leave/long-leave.service";
import { validateLongLeaveOverride } from "../src/modules/long-leave/long-leave.validators";
import { ValidationError } from "../src/utils/errors";
import type { AuthActor } from "../src/types/api.types";

describe("long leave salary impact helpers", () => {
  it("returns zero payable salary when worked days are zero", () => {
    expect(calculatePayableAmount(300000, 30, 0)).toEqual({
      dailySalaryAmount: 10000,
      estimatedPayableAmount: 0,
    });
  });

  it("pays only actual worked days", () => {
    expect(calculatePayableAmount(300000, 30, 7).estimatedPayableAmount).toBe(70000);
  });

  it("breaks long leave into impacted payroll months", () => {
    expect(monthsBetween("2026-06-15", "2026-08-01")).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("calculates month overlap days", () => {
    const record = {
      id: "long_1",
      company_id: "company_1",
      employee_id: "emp_1",
      leave_request_id: "leave_1",
      start_date: "2026-06-15",
      expected_return_date: "2026-07-05",
      actual_return_date: null,
      total_days: 21,
      status: "pending",
      salary_impact_confirmed: 0,
      created_at: "",
      updated_at: "",
    };
    expect(getMonthOverlap(record, "2026-06").days).toBe(16);
    expect(monthEndDate("2026-02")).toBe("2026-02-28");
    expect(countInclusiveDays("2026-06-01", "2026-06-01")).toBe(1);
  });

  it("uses the whole payroll month range for worked-day lookup", () => {
    expect(getPayrollMonthRange("2026-06")).toEqual({
      start: "2026-06-01",
      end: "2026-06-30",
    });
  });

  it("keeps long leave days scoped to the month overlap only", () => {
    const record = {
      id: "long_1",
      company_id: "company_1",
      employee_id: "emp_1",
      leave_request_id: "leave_1",
      start_date: "2026-06-15",
      expected_return_date: "2026-07-05",
      actual_return_date: null,
      total_days: 21,
      status: "pending",
      salary_impact_confirmed: 0,
      created_at: "",
      updated_at: "",
    };
    expect(getMonthOverlap(record, "2026-06")).toMatchObject({
      start: "2026-06-15",
      end: "2026-06-30",
      days: 16,
    });
  });

  it("requires integer minor units for override amount", () => {
    expect(() =>
      validateLongLeaveOverride({
        payroll_month: "2026-06",
        override_amount: 100.5,
        reason: "Manual override",
      }),
    ).toThrow(ValidationError);
  });
});

describe("Phase 9C long leave service behavior", () => {
  const actor: AuthActor = {
    companyId: "company_1",
    actorUserId: "user_admin",
    fullName: "Admin",
    email: "admin@example.test",
    roles: ["Admin"],
    roleKeys: ["admin"],
    permissions: [
      "long_leave.create",
      "long_leave.view",
      "long_leave.approve",
      "long_leave.reject",
      "long_leave.cancel",
      "long_leave.extend",
      "long_leave.return",
      "long_leave.payroll_preview",
      "long_leave.payroll_apply",
      "long_leave.override",
    ],
    outletIds: ["outlet_1"],
    isSuperAdmin: false,
    isAdmin: true,
    ipAddress: null,
    userAgent: null,
  };

  const baseRecord: any = {
    id: "long_1",
    company_id: "company_1",
    employee_id: "emp_1",
    leave_request_id: null,
    start_date: "2026-01-20",
    expected_return_date: "2026-03-10",
    actual_return_date: null,
    total_days: 50,
    status: "approved",
    approval_status: "approved",
    payroll_status: "not_started",
    salary_treatment: "unpaid",
    deduction_method: "calendar_days",
    payable_days_policy: "pay_only_worked_days",
    reason: "Foreign employee home leave",
    notes: null,
    created_by: "user_admin",
    salary_impact_confirmed: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    employee_code: "EMP-F",
    employee_name: "Foreign Employee",
    outlet_id: "outlet_1",
    outlet_name: "Main Outlet",
  };

  const fakeEnv = (options: {
    employeeType?: string;
    employmentStatus?: string;
    employeeOutletId?: string;
    deletedAt?: string | null;
    overlapLong?: boolean;
    overlapNormal?: boolean;
    payrollStatus?: string | null;
    salary?: number;
    workedDays?: number;
    holidayDays?: number;
    rosterDays?: number;
    attendancePunches?: number;
    approvalRequestStatus?: string | null;
    payrollImpactStatus?: string | null;
    settings?: Record<string, unknown>;
    coverage?: boolean;
    record?: typeof baseRecord;
    holidayLocalOnly?: boolean;
    holidayForeignOnly?: boolean;
    holidayRecurring?: boolean;
  } = {}) => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const employee = {
      id: "emp_1",
      employee_code: "EMP-F",
      full_name: "Foreign Employee",
      employee_type: options.employeeType ?? "foreign",
      primary_outlet_id: options.employeeOutletId ?? "outlet_1",
      employment_status: options.employmentStatus ?? "active",
      deleted_at: options.deletedAt ?? null,
      date_of_joining: "2025-01-01",
      hire_date: null,
      joined_at: null,
    };
    const settings = {
      is_enabled: 1,
      applies_to_foreigners: 1,
      applies_to_locals: 0,
      trigger_days: 30,
      max_continuous_days: null,
      salary_rule: "pay_only_worked_days",
      require_salary_impact_preview: 0,
      pay_only_worked_days: 1,
      deduct_full_salary_if_zero_worked_days: 1,
      count_holidays_inside_leave: 1,
      pay_holidays_during_long_leave: 0,
      pay_weekly_off_days_during_long_leave: 0,
      allow_hr_override: 1,
      default_salary_treatment: "unpaid",
      default_deduction_method: "calendar_days",
      require_payroll_review: 1,
      require_return_to_work_confirmation: 1,
      approval_required: 1,
      partial_pay_ratio: 0.5,
      ...options.settings,
    };
    let record = { ...(options.record ?? baseRecord) };
    return {
      statements,
      env: {
        DB: {
          prepare: (sql: string) => ({
            bind: (...values: unknown[]) => {
              const statement = {
                sql,
                values,
                first: async () => {
                  if (sql.includes("FROM company_settings")) return null;
                  if (sql.includes("FROM long_leave_settings")) return settings;
                  if (sql.includes("FROM employees WHERE")) return employee;
                  if (sql.includes("FROM long_leave_records") && sql.includes("status IN") && sql.includes("start_date <= ?") && sql.includes("COALESCE(actual_return_date")) {
                    if (sql.includes("ORDER BY start_date DESC")) return options.coverage ? record : null;
                    return options.overlapLong ? record : null;
                  }
                  if (sql.includes("FROM leave_requests")) return options.overlapNormal ? { id: "leave_overlap", status: "approved" } : null;
                  if (sql.includes("FROM long_leave_records") && sql.includes("WHERE l.company_id")) return record;
                  if (sql.includes("FROM payroll_runs")) return options.payrollStatus ? { status: options.payrollStatus } : null;
                  if (sql.includes("FROM employee_salary_history")) return { monthly_salary_amount: options.salary ?? 300000 };
                  if (sql.includes("FROM attendance_daily_summary")) return { total: options.workedDays ?? 8 };
                  if (sql.includes("JOIN holidays")) return { total: options.holidayDays ?? 0 };
                  if (sql.includes("FROM roster_shifts")) return { total: options.rosterDays ?? 0 };
                  if (sql.includes("FROM attendance_events")) return { total: options.attendancePunches ?? 0 };
                  if (sql.includes("FROM approval_requests")) return options.approvalRequestStatus ? { id: "approval_req_1", status: options.approvalRequestStatus, current_step: 1 } : null;
                  if (sql.includes("FROM long_leave_salary_impacts")) return null;
                  if (sql.includes("FROM long_leave_payroll_impacts")) return null;
                  return null;
                },
                all: async () => {
                  if (sql.includes("FROM holidays h")) {
                    const count = options.holidayDays ?? 0;
                    return {
                      results: Array.from({ length: count }, (_, index) => ({
                        id: `holiday_${index + 1}`,
                        company_id: "company_1",
                        name: `Holiday ${index + 1}`,
                        holiday_type: "company_holiday",
                        date: options.holidayRecurring ? `2025-01-${String(21 + index).padStart(2, "0")}` : `2026-01-${String(21 + index).padStart(2, "0")}`,
                        start_date: options.holidayRecurring ? `2025-01-${String(21 + index).padStart(2, "0")}` : `2026-01-${String(21 + index).padStart(2, "0")}`,
                        end_date: null,
                        is_recurring: options.holidayRecurring ? 1 : 0,
                        recurrence_month: 1,
                        recurrence_day: 21 + index,
                        applies_to_all_outlets: 1,
                        applies_to_local_employees: options.holidayForeignOnly ? 0 : 1,
                        applies_to_foreign_employees: options.holidayLocalOnly ? 0 : 1,
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
                      })),
                    };
                  }
                  if (sql.includes("FROM long_leave_payroll_impacts")) return { results: options.payrollImpactStatus ? [{ status: options.payrollImpactStatus, payroll_month: "2026-01" }] : [] };
                  if (sql.includes("FROM long_leave_salary_impacts")) return { results: [] };
                  if (sql.includes("FROM audit_logs")) return { results: [] };
                  return { results: [] };
                },
                run: async () => {
                  if (sql.includes("INSERT INTO long_leave_records")) {
                    record = {
                      ...record,
                      id: values[0] as string,
                      company_id: values[1] as string,
                      employee_id: values[2] as string,
                      leave_request_id: values[3] as string | null,
                      start_date: values[4] as string,
                      expected_return_date: values[5] as string,
                      actual_return_date: values[6] as string | null,
                      total_days: values[7] as number,
                      status: values[8] as string,
                      approval_status: values[9] as string,
                      payroll_status: values[10] as string,
                      salary_treatment: values[11] as string,
                      deduction_method: values[12] as string,
                      payable_days_policy: values[13] as string,
                      reason: values[14] as string,
                      notes: values[15] as string | null,
                      created_by: values[16] as string,
                      submitted_by: values[17] as string,
                      submitted_at: values[18] as string,
                      salary_impact_confirmed: values[19] as number,
                      created_at: values[20] as string,
                      updated_at: values[21] as string,
                    };
                  }
                  if (sql.includes("UPDATE long_leave_records")) {
                    if (values.includes("2026-04-05")) record = { ...record, expected_return_date: "2026-04-05", payroll_status: "pending_review" };
                    if (values.includes("2026-02-05")) record = { ...record, actual_return_date: "2026-02-05", payroll_status: "pending_review" };
                  }
                  return { success: true };
                },
              };
              statements.push(statement);
              return statement;
            },
          }),
          batch: async (batched: unknown[]) => batched,
        },
      } as unknown as Env,
    };
  };

  it("foreign employee can create long leave", async () => {
    const { env, statements } = fakeEnv({ payrollImpactStatus: "pending_review" });
    const result = await longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-01-20",
      expected_return_date: "2026-03-10",
      reason: "Foreign employee annual home leave",
    });

    expect(result.salary_impact_calculated).toBe(true);
    expect(statements.some((statement) => statement.sql.includes("INSERT INTO long_leave_records"))).toBe(true);
  });

  it("createLongLeave uses pay_only_worked_days settings to set payable_days_policy", async () => {
    const { env, statements } = fakeEnv({ settings: { salary_rule: "pay_only_worked_days", pay_only_worked_days: 1 } });
    await longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-07-20",
      expected_return_date: "2026-08-25",
      reason: "Policy snapshot",
    });
    const insert = statements.find((statement) => statement.sql.includes("INSERT INTO long_leave_records"));
    expect(insert?.values[13]).toBe("pay_only_worked_days");
  });

  it("createLongLeave uses settings.salary_rule to set payable_days_policy to monthly_deduction", async () => {
    const { env, statements } = fakeEnv({ settings: { salary_rule: "monthly_deduction", pay_only_worked_days: 0 } });
    await longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-07-20",
      expected_return_date: "2026-08-25",
      reason: "Monthly deduction policy snapshot",
    });
    const insert = statements.find((statement) => statement.sql.includes("INSERT INTO long_leave_records"));
    expect(insert?.values[13]).toBe("monthly_deduction");
  });

  it("monthly_deduction company settings produce monthly-deduction preview for a real created record", async () => {
    const { env } = fakeEnv({ workedDays: 7, settings: { salary_rule: "monthly_deduction", pay_only_worked_days: 0 } });
    const created = await longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-07-20",
      expected_return_date: "2026-08-25",
      reason: "Monthly preview",
    });
    expect(created.long_leave).toBeTruthy();
    const preview = await longLeaveService.previewPayrollImpact(env, actor, created.long_leave!.id);
    expect(preview.months[0].payable_salary).toBeGreaterThan(70000);
    expect(preview.months[0].payable_days).toBeGreaterThan(7);
  });

  it("pay_only_worked_days company settings produce pay-only-worked-days preview for a real created record", async () => {
    const { env } = fakeEnv({ workedDays: 7, settings: { salary_rule: "pay_only_worked_days", pay_only_worked_days: 1 } });
    const created = await longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-07-20",
      expected_return_date: "2026-08-25",
      reason: "Worked days preview",
    });
    expect(created.long_leave).toBeTruthy();
    const preview = await longLeaveService.previewPayrollImpact(env, actor, created.long_leave!.id);
    expect(preview.months[0]).toMatchObject({ payable_days: 7, payable_salary: 70000 });
  });

  it("local employee blocked unless override is allowed", async () => {
    const { env } = fakeEnv({ employeeType: "local" });
    await expect(longLeaveService.createLongLeave(env, { ...actor, permissions: ["long_leave.create"] }, {
      employee_id: "emp_1",
      start_date: "2026-01-20",
      expected_return_date: "2026-03-10",
      reason: "Local employee request",
    })).rejects.toMatchObject({ code: "LONG_LEAVE_NOT_FOREIGN_EMPLOYEE" });
  });

  it("local employee override succeeds when policy and permission allow it", async () => {
    const { env, statements } = fakeEnv({ employeeType: "local", settings: { applies_to_locals: 1 } });
    await longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-07-20",
      expected_return_date: "2026-08-25",
      allow_local_override: true,
      reason: "Approved local long leave exception",
    });
    expect(statements.some((statement) => statement.sql.includes("INSERT INTO long_leave_records"))).toBe(true);
  });

  it("terminated employee is blocked for future long leave", async () => {
    const { env } = fakeEnv({ employmentStatus: "terminated" });
    await expect(longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-07-20",
      expected_return_date: "2026-08-25",
      reason: "Future long leave",
    })).rejects.toMatchObject({ code: "LONG_LEAVE_EMPLOYEE_INELIGIBLE" });
  });

  it("start before join date is blocked", async () => {
    const { env } = fakeEnv();
    await expect(longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2024-12-01",
      expected_return_date: "2025-02-01",
      reason: "Before joining",
    })).rejects.toMatchObject({ code: "LONG_LEAVE_INVALID_DATE_RANGE" });
  });

  it("backdated long leave requires override permission", async () => {
    const { env } = fakeEnv();
    await expect(longLeaveService.createLongLeave(env, { ...actor, permissions: ["long_leave.create"] }, {
      employee_id: "emp_1",
      start_date: "2026-01-20",
      expected_return_date: "2026-03-10",
      reason: "Backdated request",
    })).rejects.toMatchObject({ code: "LONG_LEAVE_BACKDATE_NOT_ALLOWED" });
  });

  it("overlapping normal leave is blocked", async () => {
    const { env } = fakeEnv({ overlapNormal: true });
    await expect(longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-07-20",
      expected_return_date: "2026-08-25",
      reason: "Overlap normal leave",
    })).rejects.toMatchObject({ code: "LONG_LEAVE_OVERLAP_EXISTS" });
  });

  it("outlet-scoped user cannot access another outlet employee", async () => {
    const { env } = fakeEnv({ employeeOutletId: "outlet_2" });
    await expect(longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-07-20",
      expected_return_date: "2026-08-25",
      reason: "Wrong outlet",
    })).rejects.toMatchObject({ code: "OUTLET_ACCESS_DENIED" });
  });

  it("duration below threshold blocked", async () => {
    const { env } = fakeEnv();
    await expect(longLeaveService.createLongLeave(env, { ...actor, permissions: ["long_leave.create"] }, {
      employee_id: "emp_1",
      start_date: "2026-01-20",
      expected_return_date: "2026-02-01",
      reason: "Too short",
    })).rejects.toMatchObject({ code: "LONG_LEAVE_DURATION_TOO_SHORT" });
  });

  it("overlapping long leave blocked", async () => {
    const { env } = fakeEnv({ overlapLong: true });
    await expect(longLeaveService.createLongLeave(env, actor, {
      employee_id: "emp_1",
      start_date: "2026-01-20",
      expected_return_date: "2026-03-10",
      reason: "Overlap",
    })).rejects.toMatchObject({ code: "LONG_LEAVE_OVERLAP_EXISTS" });
  });

  it("payroll preview for multi-month long leave is split by month", async () => {
    const { env } = fakeEnv();
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");

    expect(preview.months.map((row) => row.payroll_month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(preview.months[0]).toMatchObject({ long_leave_days: 12, total_days: 31 });
    expect(preview.months[1]).toMatchObject({ long_leave_days: 28 });
    expect(preview.months[2]).toMatchObject({ long_leave_days: 10, total_days: 31 });
  });

  it("calendar-day and pay-only-worked-days policies produce different results", async () => {
    const monthlyEnv = fakeEnv({ workedDays: 7, settings: { pay_only_worked_days: 0, salary_rule: "monthly_deduction" } }).env;
    const workedOnlyEnv = fakeEnv({ workedDays: 7, settings: { pay_only_worked_days: 1, salary_rule: "pay_only_worked_days" } }).env;
    const monthly = await calculateLongLeavePayrollPreview(monthlyEnv, { ...baseRecord, payable_days_policy: "monthly_deduction" });
    const workedOnly = await calculateLongLeavePayrollPreview(workedOnlyEnv, baseRecord);
    expect(monthly[0].payable_salary).not.toBe(workedOnly[0].payable_salary);
    expect(workedOnly[0]).toMatchObject({ payable_days: 7, payable_salary: 70000 });
  });

  it("null payable_days_policy uses monthly_deduction settings fallback", async () => {
    const env = fakeEnv({ workedDays: 7, settings: { salary_rule: "monthly_deduction", pay_only_worked_days: 0 } }).env;
    const preview = await calculateLongLeavePayrollPreview(env, { ...baseRecord, payable_days_policy: null });
    expect(preview[0].payable_salary).toBeGreaterThan(70000);
    expect(preview[0].payable_days).toBeGreaterThan(7);
  });

  it("null payable_days_policy uses pay_only_worked_days settings fallback", async () => {
    const env = fakeEnv({ workedDays: 7, settings: { salary_rule: "pay_only_worked_days", pay_only_worked_days: 1 } }).env;
    const preview = await calculateLongLeavePayrollPreview(env, { ...baseRecord, payable_days_policy: null });
    expect(preview[0]).toMatchObject({ payable_days: 7, payable_salary: 70000 });
  });

  it("working-days deduction excludes weekends", async () => {
    const env = fakeEnv({
      workedDays: 0,
      settings: { pay_only_worked_days: 0, salary_rule: "monthly_deduction" },
      record: { ...baseRecord, payable_days_policy: "monthly_deduction", deduction_method: "working_days" },
    }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months[1].unpaid_days).toBe(20);
  });

  it("scheduled roster deduction uses roster days and falls back with warning when roster is missing", async () => {
    const rosterEnv = fakeEnv({
      rosterDays: 5,
      settings: { pay_only_worked_days: 0, salary_rule: "monthly_deduction" },
      record: { ...baseRecord, payable_days_policy: "monthly_deduction", deduction_method: "scheduled_roster_days" },
    }).env;
    const fallbackEnv = fakeEnv({
      rosterDays: 0,
      settings: { pay_only_worked_days: 0, salary_rule: "monthly_deduction" },
      record: { ...baseRecord, payable_days_policy: "monthly_deduction", deduction_method: "scheduled_roster_days" },
    }).env;
    expect((await longLeaveService.previewPayrollImpact(rosterEnv, actor, "long_1")).months[0].unpaid_days).toBe(5);
    expect((await longLeaveService.previewPayrollImpact(fallbackEnv, actor, "long_1")).months[0].warning_code).toBe("LONG_LEAVE_PAYROLL_ROSTER_FALLBACK");
  });

  it("attendance-days deduction pays only actual attendance plus payable non-work days", async () => {
    const env = fakeEnv({
      workedDays: 7,
      holidayDays: 1,
      settings: { pay_only_worked_days: 0, salary_rule: "monthly_deduction", pay_holidays_during_long_leave: 1 },
      record: { ...baseRecord, payable_days_policy: "monthly_deduction", deduction_method: "attendance_days" },
    }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months[0].payable_days).toBe(8);
  });

  it("paid salary treatment produces zero deduction", async () => {
    const env = fakeEnv({ record: { ...baseRecord, salary_treatment: "paid" } }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months[0]).toMatchObject({ deduction_amount: 0, payable_salary: 300000 });
  });

  it("partially paid treatment applies partial-pay ratio and flags review", async () => {
    const env = fakeEnv({
      settings: { pay_only_worked_days: 0, salary_rule: "monthly_deduction", partial_pay_ratio: 0.5 },
      record: { ...baseRecord, payable_days_policy: "monthly_deduction", salary_treatment: "partially_paid" },
    }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months[0].warning_code).toBe("LONG_LEAVE_PARTIAL_PAY_REVIEW");
    expect(preview.months[0].deduction_amount).toBe(60000);
  });

  it("custom salary treatment requires payroll review without automatic deduction", async () => {
    const env = fakeEnv({ record: { ...baseRecord, payable_days_policy: "monthly_deduction", salary_treatment: "custom" } }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months[0]).toMatchObject({
      deduction_amount: 0,
      warning_code: "LONG_LEAVE_PAYROLL_REVIEW_REQUIRED",
    });
  });

  it("zero worked days produce zero payable salary under pay-only-worked-days policy", async () => {
    const env = fakeEnv({ workedDays: 0, settings: { pay_only_worked_days: 1, salary_rule: "pay_only_worked_days" } }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months[0]).toMatchObject({ payable_days: 0, payable_salary: 0 });
  });

  it("payable holidays are included only when settings allow them", async () => {
    const unpaidHolidayEnv = fakeEnv({ workedDays: 0, holidayDays: 1, settings: { pay_holidays_during_long_leave: 0 } }).env;
    const paidHolidayEnv = fakeEnv({ workedDays: 0, holidayDays: 1, settings: { pay_holidays_during_long_leave: 1 } }).env;
    expect((await longLeaveService.previewPayrollImpact(unpaidHolidayEnv, actor, "long_1")).months[0].payable_days).toBe(0);
    expect((await longLeaveService.previewPayrollImpact(paidHolidayEnv, actor, "long_1")).months[0].payable_days).toBe(1);
  });

  it("long-leave payroll preview uses shared recurring holiday context", async () => {
    const env = fakeEnv({ workedDays: 0, holidayDays: 1, holidayRecurring: true, settings: { pay_holidays_during_long_leave: 1 } }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months[0]).toMatchObject({ holiday_days: 1, payable_holiday_days: 1, payable_days: 1 });
  });

  it("local-only holiday does not apply to a foreign employee in long-leave payroll preview", async () => {
    const env = fakeEnv({ workedDays: 0, holidayDays: 1, holidayLocalOnly: true, settings: { pay_holidays_during_long_leave: 1 } }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months[0]).toMatchObject({ holiday_days: 0, payable_holiday_days: 0, payable_days: 0 });
  });

  it("foreign-only holiday applies to a foreign employee in long-leave payroll preview", async () => {
    const env = fakeEnv({ workedDays: 0, holidayDays: 1, holidayForeignOnly: true, settings: { pay_holidays_during_long_leave: 1 } }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months[0]).toMatchObject({ holiday_days: 1, payable_holiday_days: 1, payable_days: 1 });
  });

  it("payroll preview does not mutate data", async () => {
    const { env, statements } = fakeEnv();
    await longLeaveService.previewPayrollImpact(env, actor, "long_1");

    expect(statements.some((statement) => statement.sql.includes("INSERT INTO long_leave_payroll_impacts"))).toBe(false);
    expect(statements.some((statement) => statement.sql.includes("UPDATE long_leave_payroll_impacts"))).toBe(false);
  });

  it("payroll apply is idempotent", async () => {
    const { env, statements } = fakeEnv();
    await longLeaveService.applyPayrollImpact(env, actor, "long_1", { reason: "Payroll review" });
    await longLeaveService.applyPayrollImpact(env, actor, "long_1", { reason: "Payroll review retry" });

    const idempotencyValues = statements.flatMap((statement) => statement.values).filter((value) => typeof value === "string" && value.startsWith("long_leave:long_1:"));
    expect(idempotencyValues).toContain("long_leave:long_1:2026-01");
    expect(idempotencyValues).toContain("long_leave:long_1:2026-02");
    expect(idempotencyValues).toContain("long_leave:long_1:2026-03");
  });

  it("payroll apply stores review rows without claiming payroll was adjusted", async () => {
    const { env, statements } = fakeEnv();
    const result = await longLeaveService.applyPayrollImpact(env, actor, "long_1", { reason: "Payroll review" });
    expect(result).toMatchObject({ applied: false, review_recorded: true });
    expect(statements.some((statement) => statement.sql.includes("payroll_status = ?") && statement.values.includes("payroll_adjusted"))).toBe(false);
    expect(statements.some((statement) => statement.sql.includes("payroll_status = ?") && statement.values.includes("pending_review"))).toBe(true);
  });

  it("closed payroll period blocks apply", async () => {
    const { env } = fakeEnv({ payrollStatus: "finalized" });
    await expect(longLeaveService.applyPayrollImpact(env, actor, "long_1", { reason: "Closed payroll" }))
      .rejects.toMatchObject({ code: "LONG_LEAVE_PAYROLL_PERIOD_CLOSED" });
  });

  it("early return recalculates final month long-leave days", async () => {
    const env = fakeEnv({ record: { ...baseRecord, actual_return_date: "2026-02-05" } }).env;
    const preview = await longLeaveService.previewPayrollImpact(env, actor, "long_1");
    expect(preview.months.map((row) => row.payroll_month)).toEqual(["2026-01", "2026-02"]);
    expect(preview.months[1].long_leave_days).toBe(5);
  });

  it("extension recalculates added month and forces payroll review", async () => {
    const { env, statements } = fakeEnv({ payrollImpactStatus: "pending_review" });
    const result = await longLeaveService.extendLongLeave(env, actor, "long_1", {
      new_expected_return_date: "2026-04-05",
      reason: "Travel delayed",
    });
    expect(result.payroll_preview.months.map((row) => row.payroll_month)).toContain("2026-04");
    expect(statements.some((statement) => statement.values.includes("pending_review"))).toBe(true);
  });

  it("settings update is persisted and audited", async () => {
    const { env, statements } = fakeEnv();
    await longLeaveService.updateSettings(env, actor, {
      trigger_days: 45,
      default_deduction_method: "working_days",
      pay_only_worked_days: false,
      reason: "Policy change",
    });
    expect(statements.some((statement) => statement.sql.includes("UPDATE long_leave_settings"))).toBe(true);
    expect(statements.some((statement) => statement.sql.includes("INSERT INTO audit_logs"))).toBe(true);
  });

  it("changing long-leave settings does not silently rewrite historical records", async () => {
    const { env, statements } = fakeEnv();
    await longLeaveService.updateSettings(env, actor, {
      salary_rule: "monthly_deduction",
      pay_only_worked_days: false,
      reason: "Change future policy only",
    });
    expect(statements.some((statement) => statement.sql.includes("UPDATE long_leave_records"))).toBe(false);
  });

  it("approval finalization syncs generic approval request", async () => {
    const { env, statements } = fakeEnv({ record: { ...baseRecord, status: "pending_approval", approval_status: "pending" }, approvalRequestStatus: "pending" });
    await longLeaveService.approveLongLeave(env, actor, "long_1", { reason: "Override approval" });
    expect(statements.some((statement) => statement.sql.includes("UPDATE approval_requests") && statement.values.includes("approved"))).toBe(true);
  });

  it("approval without workflow completion is blocked unless override is present", async () => {
    const { env } = fakeEnv({ record: { ...baseRecord, status: "pending_approval", approval_status: "pending" }, approvalRequestStatus: "pending" });
    await expect(longLeaveService.approveLongLeave(env, { ...actor, permissions: ["long_leave.approve"] }, "long_1", { reason: "Approve" }))
      .rejects.toMatchObject({ code: "LONG_LEAVE_APPROVAL_REQUIRED" });
  });

  it("rejection and cancellation sync generic approval request", async () => {
    const rejectEnv = fakeEnv({ record: { ...baseRecord, status: "pending_approval", approval_status: "pending" }, approvalRequestStatus: "pending" });
    await longLeaveService.rejectLongLeave(rejectEnv.env, actor, "long_1", { reason: "Rejected" });
    expect(rejectEnv.statements.some((statement) => statement.sql.includes("UPDATE approval_requests") && statement.values.includes("rejected"))).toBe(true);

    const cancelEnv = fakeEnv({ record: { ...baseRecord, status: "pending_approval" }, approvalRequestStatus: "pending" });
    await longLeaveService.cancelLongLeave(cancelEnv.env, actor, "long_1", { reason: "Cancelled" });
    expect(cancelEnv.statements.some((statement) => statement.sql.includes("UPDATE approval_requests") && statement.values.includes("cancelled"))).toBe(true);
  });

  it("long-leave coverage lookup identifies approved coverage for attendance context", async () => {
    const { env } = fakeEnv({ coverage: true });
    const coverage = await longLeaveService.getLongLeaveCoverageForDate(env, actor, "emp_1", "2026-02-01");
    expect(coverage.long_leave).toMatchObject({ id: "long_1" });
  });

  it("punch during long leave creates warning", async () => {
    const { env } = fakeEnv({ attendancePunches: 2 });
    const timeline = await longLeaveService.getTimeline(env, actor, "long_1");
    expect(timeline.attendance_warnings).toEqual([
      expect.objectContaining({ type: "employee_worked_during_long_leave" }),
    ]);
  });

  it("long-leave settings UI exposes all backend-supported policy switches", () => {
    const panel = readFileSync("frontend/src/features/long-leave/LongLeaveSettingsPanel.tsx", "utf8");
    expect(panel).toContain("count_holidays_inside_leave");
    expect(panel).toContain("require_salary_impact_preview");
    expect(panel).toContain("deduct_full_salary_if_zero_worked_days");
    expect(panel).toContain("allow_hr_override");
  });
});
