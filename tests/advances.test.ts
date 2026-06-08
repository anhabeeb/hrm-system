import { describe, expect, it } from "vitest";

import { validateAdvanceCreate } from "../src/modules/advances/advances.validators";
import { ValidationError } from "../src/utils/errors";

describe("advance validators", () => {
  it("requires integer minor units", () => {
    expect(() =>
      validateAdvanceCreate({
        employee_id: "emp_1",
        amount: 100.5,
        paid_date: "2026-06-10",
        deduction_month: "2026-06",
        reason: "Advance",
      }),
    ).toThrow(ValidationError);
  });
});


