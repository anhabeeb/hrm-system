import { describe, expect, it } from "vitest";

import { validateUniformIssue, validateUniformReturn } from "../src/modules/uniforms/uniforms.validators";
import { ValidationError } from "../src/utils/errors";

describe("uniform validators", () => {
  it("requires positive integer quantity", () => {
    expect(() =>
      validateUniformIssue({
        employee_id: "emp_1",
        uniform_type: "shirt",
        quantity: 0,
        issued_date: "2026-06-01",
      }),
    ).toThrow(ValidationError);
  });

  it("requires reason for uniform return", () => {
    expect(() => validateUniformReturn({ returned_date: "2026-06-10" })).toThrow(ValidationError);
  });
});


