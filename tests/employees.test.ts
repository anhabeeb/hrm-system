import { describe, expect, it } from "vitest";

import {
  validateEmployeeCreateInput,
  validateEmployeeUpdateInput,
  validateSalaryHistoryInput,
} from "../src/modules/employees/employees.validators";
import { AppError, ValidationError } from "../src/utils/errors";

describe("employee validators", () => {
  it("accepts a local employee without creating any user login data", () => {
    const input = validateEmployeeCreateInput({
      employee_code: "EMP-001",
      full_name: "Ahmed Ali",
      employee_type: "local",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      joined_at: "2026-05-01",
    });

    expect(input.employee_code).toBe("EMP-001");
    expect("password" in input).toBe(false);
  });

  it("requires nationality for foreign employees", () => {
    expect(() =>
      validateEmployeeCreateInput({
        employee_code: "EMP-002",
        full_name: "Foreign Employee",
        employee_type: "foreign",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
      }),
    ).toThrow("Nationality is required for foreign employees.");
  });

  it("requires salary values to be integer minor units", () => {
    expect(() =>
      validateSalaryHistoryInput({
        monthly_salary_amount: 1000.5,
        effective_from: "2026-06-01",
        reason: "Salary setup",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects employment status changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        employment_status: "terminated",
      }),
    ).toThrow(AppError);
  });

  it("rejects resigned date changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        resigned_at: "2026-06-01",
      }),
    ).toThrow("Employee status changes must be made through the status action.");
  });

  it("rejects terminated date changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        terminated_at: "2026-06-01",
      }),
    ).toThrow("Employee status changes must be made through the status action.");
  });

  it("rejects primary outlet changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        primary_outlet_id: "outlet_2",
      }),
    ).toThrow("Employee outlet changes must be made through the outlet assignment action.");
  });
});

describe("employee module placeholders", () => {
  it.todo("duplicate employee code is blocked by the service");
  it.todo("list employees supports filters for professional table views");
  it.todo("employee detail masks sensitive fields without employees.view_sensitive");
  it.todo("archive employee requires reason");
  it.todo("restore employee requires reason");
  it.todo("status endpoint can change status with reason and proper permission");
  it.todo("outlet assignment endpoint can change outlet with reason and proper permission");
  it.todo("status change creates employee_status_history");
  it.todo("outlet assignment creates employee_job_history");
  it.todo("employee list total count does not include inaccessible outlets");
  it.todo("employee list with inaccessible outlet_id returns an empty result");
  it.todo("archive disables linked user account and revokes sessions");
  it.todo("resigned status disables linked user account and revokes sessions");
  it.todo("terminated status disables linked user account and revokes sessions");
  it.todo("restore does not automatically re-enable linked user account");
  it.todo("salary history requires salary.view");
  it.todo("employee creation does not create a user login");
  it.todo("outlet manager cannot access another outlet's employee");
  it.todo("unauthorized user cannot view salary history");
  it.todo("audit logs are created for sensitive changes");
  it.todo("create outlet");
  it.todo("disable outlet requires reason and does not delete employees");
  it.todo("create department");
  it.todo("delete department requires reason");
  it.todo("create position with integer salary");
  it.todo("delete position requires reason");
});
