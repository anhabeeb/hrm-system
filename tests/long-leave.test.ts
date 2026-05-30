import { describe, expect, it } from "vitest";

import {
  calculatePayableAmount,
  countInclusiveDays,
  getPayrollMonthRange,
  getMonthOverlap,
  monthEndDate,
  monthsBetween,
} from "../src/modules/long-leave/long-leave-calculator.service";
import { validateLongLeaveOverride } from "../src/modules/long-leave/long-leave.validators";
import { ValidationError } from "../src/utils/errors";

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

describe("long leave module placeholders", () => {
  it.todo("create long leave record");
  it.todo("direct long leave creation calculates salary impact when possible");
  it.todo("direct long leave creation returns salary_impact_calculated flag");
  it.todo("direct long leave creation does not fail if preview cannot be calculated due to missing salary history");
  it.todo("direct long leave creation does not partially write impact rows if payroll is locked");
  it.todo("trigger days are enforced");
  it.todo("salary impact calculated month by month");
  it.todo("long leave starts mid-month and worked days before leave are counted");
  it.todo("worked_days uses the whole payroll month");
  it.todo("long_leave_days uses only the leave overlap period");
  it.todo("worked days affect payable salary");
  it.todo("absent and on_leave days are not counted as worked days");
  it.todo("fixed_30_days calculation uses 30 as denominator");
  it.todo("if one affected month is locked no salary impact rows are updated");
  it.todo("unlocked months are not partially updated before a locked month fails");
  it.todo("all unlocked months allow impact rows to be upserted");
  it.todo("confirm fails if no salary impact rows exist");
  it.todo("approve long leave calculates impact if missing or fails with a friendly message");
  it.todo("salary_impact_confirmed changes only on confirm endpoint");
  it.todo("salary impact confirmation required");
  it.todo("long leave approval works");
  it.todo("long leave return sets employee active");
  it.todo("long leave override blocked for locked payroll");
  it.todo("long leave override requires reason");
  it.todo("long leave override requires integer minor units");
  it.todo("sensitive salary impact details are not sent over broad realtime");
  it.todo("audit logs are created for sensitive long leave actions");
});
