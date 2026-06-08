import { describe, expect, it } from "vitest";

import { validateLoanCreate } from "../src/modules/salary-loans/salary-loans.validators";
import { ValidationError } from "../src/utils/errors";

describe("salary loan validators", () => {
  it("blocks installment amount greater than loan amount", () => {
    expect(() =>
      validateLoanCreate({
        employee_id: "emp_1",
        loan_amount: 100000,
        installment_amount: 200000,
        start_month: "2026-06",
        reason: "Loan",
      }),
    ).toThrow(ValidationError);
  });
});


