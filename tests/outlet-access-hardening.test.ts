import { describe, it } from "vitest";

describe("outlet access hardening placeholders", () => {
  it.todo("outlet-limited user sees only their outlet employees and employee-linked records");
  it.todo("outlet-limited payroll item lists and totals include only accessible outlet items");
  it.todo("outlet-limited document lists and reports filter through employee.primary_outlet_id");
  it.todo("outlet-limited approval lists do not leak inaccessible counts");
  it.todo("outlet-limited reports and exports return scoped totals only");
  it.todo("pagination totals match outlet-filtered SQL/count queries");
  it.todo("company-level/no-outlet approval records are visible only to eligible approvers, requester, or Super Admin");
  it.todo("payroll locks block attendance, leave, long leave, advances, loans, asset deductions, and payroll-impacting imports");
});
