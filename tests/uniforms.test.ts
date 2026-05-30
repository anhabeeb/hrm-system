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

describe("uniform module placeholders", () => {
  it.todo("POST /api/v1/uniforms/issue exists");
  it.todo("GET /api/v1/uniforms/:id exists");
  it.todo("issue uniform");
  it.todo("issue route alias works");
  it.todo("detail route works");
  it.todo("uniform detail applies outlet access");
  it.todo("uniform detail does not expose sensitive employee fields");
  it.todo("issue uniform requires accessible employee");
  it.todo("issue uniform with matching outlet_id succeeds");
  it.todo("issue uniform without outlet_id uses employee primary outlet");
  it.todo("issue uniform with inaccessible outlet_id is blocked");
  it.todo("issue uniform with inactive outlet is blocked");
  it.todo("issue uniform with outlet different from employee outlet is rejected");
  it.todo("outlet_id is stored in uniform_issues");
  it.todo("quantity must be positive integer");
  it.todo("return uniform requires reason");
  it.todo("cannot return already returned uniform");
  it.todo("pending return endpoint returns issued uniforms only");
  it.todo("uniform list is outlet-filtered");
  it.todo("device-authenticated requests cannot access uniforms");
});
