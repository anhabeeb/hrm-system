import { describe, it } from "vitest";

describe("Phase 1 searchable selectors", () => {
  it.todo("employee selector searches /api/v1/lookups/employees and never renders salary, document, bank, or security fields");
  it.todo("outlet selector scopes results to accessible outlets");
  it.todo("EmployeeCombobox displays employee code and name");
  it.todo("EmployeeCombobox sends outlet_id when outletId prop is passed");
  it.todo("department and position selectors preserve employee form payload field names");
  it.todo("leave type selector shows only enabled leave types by default");
  it.todo("payroll period selector uses payroll run labels while submitting payroll_run_id");
  it.todo("payroll period selector displays month, year, and status instead of raw IDs");
  it.todo("manual attendance batch UI requires an outlet before loading employees");
  it.todo("manual attendance batch UI renders employee rows by employee code and name");
  it.todo("manual attendance batch UI submits multiple selected employee rows");
  it.todo("attendance corrections page route exists and loads a correction request table");
  it.todo("desktop sidebar remains sticky and collapsed navigation icons are centered");
});
