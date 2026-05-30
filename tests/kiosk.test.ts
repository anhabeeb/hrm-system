import { describe, expect, it } from "vitest";

import { validateKioskClockInput } from "../src/modules/kiosk/kiosk.validators";

describe("kiosk validators", () => {
  it("defaults kiosk clock method to kiosk", () => {
    const input = validateKioskClockInput({ employee_id: "emp_1" });
    expect(input.attendance_method).toBe("kiosk");
  });
});

describe("kiosk placeholders", () => {
  it.todo("kiosk status requires device auth");
  it.todo("kiosk employee list returns only safe fields");
  it.todo("kiosk employee list returns only device outlet employees");
  it.todo("kiosk clock-in creates event with device_id");
  it.todo("kiosk clock-out creates event with device_id");
  it.todo("wrong outlet kiosk clock-in returns conflict message instead of success");
  it.todo("missing clock-in kiosk clock-out returns conflict message instead of success");
  it.todo("successful kiosk clock-in returns success message");
  it.todo("successful kiosk clock-out returns success message");
  it.todo("duplicate local_id returns existing event");
  it.todo("kiosk conflict creates audit log or system-safe fallback");
  it.todo("disabled device cannot clock in");
  it.todo("kiosk cannot access payroll/documents/settings");
  it.todo("sensitive employee fields are not returned in kiosk employee list");
});
