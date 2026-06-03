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

describe("salary loan placeholders", () => {
  it.todo("create loan");
  it.todo("approve loan creates installments");
  it.todo("final installment can be smaller");
  it.todo("pause loan stops future deductions");
  it.todo("settle loan clears outstanding");
  it.todo("salary loan installment deducts in payroll");
  it.todo("approving loan with locked installment month is blocked");
  it.todo("editing loan start_month into locked month is blocked");
  it.todo("editing installment amount affecting locked schedule is blocked");
  it.todo("pausing loan with locked installment is blocked");
  it.todo("settling loan with locked installment is blocked");
  it.todo("approving already approved loan returns conflict");
  it.todo("repeated approval does not create duplicate installments");
  it.todo("installments are created only once");
  it.todo("unlocked loan workflow still works");
});
