import { describe, expect, it } from "vitest";

import { validateKioskClockInput } from "../src/modules/kiosk/kiosk.validators";

describe("kiosk validators", () => {
  it("defaults kiosk clock method to kiosk", () => {
    const input = validateKioskClockInput({ employee_id: "emp_1" });
    expect(input.attendance_method).toBe("kiosk");
  });
});


