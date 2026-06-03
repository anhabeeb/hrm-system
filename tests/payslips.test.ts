import { describe, expect, it } from "vitest";

import { validatePayslipGenerate } from "../src/modules/payslips/payslips.validators";
import { ValidationError } from "../src/utils/errors";

describe("payslip validators", () => {
  it("requires reason for batch generation", () => {
    expect(() => validatePayslipGenerate({ payroll_run_id: "pay_1" })).toThrow(ValidationError);
  });
});

describe("payslip placeholders", () => {
  it.todo("generate payslip metadata after payroll lock or approval");
  it.todo("does not duplicate payslips");
  it.todo("payslip list applies outlet access");
  it.todo("limited user generates payslips only for accessible outlet");
  it.todo("limited user cannot generate payslips for inaccessible outlet");
  it.todo("Super Admin can generate company-wide payslips");
  it.todo("payslip batch response includes scope");
  it.todo("PDF placeholder returns friendly message");
});
