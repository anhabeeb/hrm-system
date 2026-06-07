import { describe, expect, it } from "vitest";

import {
  validateEmployeeCreateInput,
  validateEmployeeUpdateInput,
  validateSalaryHistoryInput,
} from "../src/modules/employees/employees.validators";
import { AppError } from "../src/utils/errors";

const startingSalary = {
  amount: 750000,
  salary_type: "monthly",
  currency: "MVR",
  effective_from: "2026-05-01",
  reason: "Starting salary",
};

describe("employee validators", () => {
  it("accepts a local employee without creating any user login data", () => {
    const input = validateEmployeeCreateInput({
      full_name: "Ahmed Ali",
      employee_type: "local",
      id_card_number: "A123456",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      joined_at: "2026-05-01",
      starting_salary: startingSalary,
    });

    expect(input.employee_code).toBeUndefined();
    expect(input.id_card_number).toBe("A123456");
    expect("password" in input).toBe(false);
  });

  it("requires starting salary during employee creation", () => {
    expect(() =>
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
      }),
    ).toThrow(AppError);

    try {
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("STARTING_SALARY_REQUIRED");
      expect((error as AppError).fieldErrors?.["starting_salary.amount"]).toBe("Starting salary is required.");
    }
  });

  it("defaults starting salary effective date to joining date and currency to MVR", () => {
    const input = validateEmployeeCreateInput({
      full_name: "Ahmed Ali",
      employee_type: "local",
      id_card_number: "A123456",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      joined_at: "2026-05-01",
      starting_salary: {
        amount: 750000,
      },
    });

    expect(input.starting_salary.monthly_salary_amount).toBe(750000);
    expect(input.starting_salary.effective_from).toBe("2026-05-01");
    expect(input.starting_salary.currency).toBe("MVR");
    expect(input.starting_salary.salary_type).toBe("monthly");
  });

  it("rejects invalid starting salary amount with a field error", () => {
    expect(() =>
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
        starting_salary: {
          amount: 0,
        },
      }),
    ).toThrow(AppError);

    try {
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
        starting_salary: {
          amount: 0,
        },
      });
    } catch (error) {
      expect((error as AppError).code).toBe("INVALID_SALARY_AMOUNT");
      expect((error as AppError).fieldErrors?.["starting_salary.amount"]).toContain("positive amount");
    }
  });

  it("rejects unsupported salary type", () => {
    try {
      validateEmployeeCreateInput({
        full_name: "Ahmed Ali",
        employee_type: "local",
        id_card_number: "A123456",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        joined_at: "2026-05-01",
        starting_salary: {
          amount: 750000,
          salary_type: "daily",
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_TYPE");
      expect((error as AppError).fieldErrors?.["starting_salary.salary_type"]).toBe("Select a valid salary type.");
    }
  });

  it("requires National ID for local employees", () => {
    expect(() =>
      validateEmployeeCreateInput({
        full_name: "Local Employee",
        employee_type: "local",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        starting_salary: startingSalary,
      }),
    ).toThrow("National ID number is required for local employees.");
  });

  it("requires nationality, passport, and work permit details for foreign employees", () => {
    expect(() =>
      validateEmployeeCreateInput({
        full_name: "Foreign Employee",
        employee_type: "foreign",
        primary_outlet_id: "outlet_1",
        employment_status: "active",
        starting_salary: startingSalary,
      }),
    ).toThrow("Please complete the required foreign employee identity fields.");
  });

  it("accepts complete foreign employee identity details", () => {
    const input = validateEmployeeCreateInput({
      full_name: "Foreign Employee",
      employee_type: "foreign",
      nationality: "Sri Lankan",
      passport_number: "n1234567",
      passport_expiry_date: "2028-06-01",
      work_permit_number: "wp-9988",
      work_permit_expiry_date: "2027-06-01",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      starting_salary: startingSalary,
    });

    expect(input.passport_number).toBe("n1234567");
    expect(input.work_permit_number).toBe("wp-9988");
  });

  it("normalizes blank identity strings to null", () => {
    const input = validateEmployeeCreateInput({
      full_name: "Ahmed Ali",
      employee_type: "local",
      id_card_number: " A123456 ",
      passport_number: "   ",
      primary_outlet_id: "outlet_1",
      employment_status: "active",
      starting_salary: startingSalary,
    });

    expect(input.id_card_number).toBe("A123456");
    expect(input.passport_number).toBeNull();
  });

  it("rejects employee code changes from general employee update", () => {
    expect(() =>
      validateEmployeeUpdateInput({
        employee_code: "EMP-999999",
      }),
    ).toThrow("Employee ID is system-generated and cannot be changed here.");
  });

  it("requires salary values to be integer minor units", () => {
    expect(() =>
      validateSalaryHistoryInput({
        monthly_salary_amount: 1000.5,
        effective_from: "2026-06-01",
        change_type: "increment",
        reason: "Salary setup",
      }),
    ).toThrow(AppError);
  });

  it("accepts a salary increment with integer minor units and normalized currency", () => {
    const input = validateSalaryHistoryInput({
      monthly_salary_amount: 850000,
      currency: "mvr",
      effective_from: "2026-07-01",
      change_type: "increment",
      reason: "Annual salary increment after performance review",
    });

    expect(input.monthly_salary_amount).toBe(850000);
    expect(input.currency).toBe("MVR");
    expect(input.change_type).toBe("increment");
  });

  it("returns salary-specific field errors for invalid increment amount", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 0,
        effective_from: "2026-07-01",
        change_type: "increment",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_AMOUNT");
      expect((error as AppError).fieldErrors?.monthly_salary_amount).toBe("Salary amount must be greater than zero.");
    }
  });

  it("rejects negative salary amounts", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: -1,
        effective_from: "2026-07-01",
        change_type: "increment",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_AMOUNT");
      expect((error as AppError).fieldErrors?.monthly_salary_amount).toBe("Salary amount must be greater than zero.");
    }
  });

  it("defaults salary change currency to MVR when omitted", () => {
    const input = validateSalaryHistoryInput({
      monthly_salary_amount: 850000,
      effective_from: "2026-07-01",
      change_type: "increment",
      reason: "Annual salary increment",
    });

    expect(input.currency).toBe("MVR");
  });

  it("rejects invalid salary currency codes", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 850000,
        currency: "MVRF",
        effective_from: "2026-07-01",
        change_type: "increment",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION_ERROR");
      expect((error as AppError).fieldErrors?.currency).toBe("Please enter a valid currency code.");
    }
  });

  it("requires a valid salary effective date", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 850000,
        effective_from: "2026-99-99",
        change_type: "increment",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_EFFECTIVE_DATE");
      expect((error as AppError).fieldErrors?.effective_from).toBe("Please enter a valid effective date.");
    }
  });

  it("requires a supported salary change type", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 850000,
        effective_from: "2026-07-01",
        change_type: "promotion",
        reason: "Annual salary increment",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_SALARY_CHANGE_TYPE");
      expect((error as AppError).fieldErrors?.change_type).toBe("Select a valid salary change type.");
    }
  });

  it("requires a salary change reason", () => {
    try {
      validateSalaryHistoryInput({
        monthly_salary_amount: 850000,
        effective_from: "2026-07-01",
        change_type: "increment",
        reason: "",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("SALARY_CHANGE_REASON_REQUIRED");
      expect((error as AppError).fieldErrors?.reason).toBe("Reason is required.");
    }
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
  it.todo("creating local employee without employee_code generates EMP-000001 style code");
  it.todo("creating second employee generates the next company-scoped employee code");
  it.todo("duplicate employee code is blocked by the service with DUPLICATE_EMPLOYEE_CODE");
  it.todo("duplicate National ID in the same company returns DUPLICATE_NATIONAL_ID");
  it.todo("duplicate passport number in the same company returns DUPLICATE_PASSPORT_NUMBER");
  it.todo("duplicate work permit number in the same company returns DUPLICATE_WORK_PERMIT_NUMBER");
  it.todo("same identity numbers in different companies are allowed when tenant scoping permits");
  it.todo("existing employee_code values are not overwritten by migrations or updates");
  it.todo("employee list and detail return identity fields without document storage internals");
  it.todo("migration creates employee_code_sequences and employee identity unique indexes safely");
  it.todo("create employee form does not require employee_code");
  it.todo("create employee form shows System generated after save");
  it.todo("employee table displays generated Employee ID");
  it.todo("employee detail shows generated Employee ID and identity section");
  it.todo("duplicate identity field errors show beside the correct frontend fields");
  it.todo("list employees supports filters for professional table views");
  it.todo("employee detail masks sensitive fields without employees.view_sensitive");
  it.todo("creating employee with valid starting salary creates employee_salary_history row");
  it.todo("employee creation does not leave orphan employee if salary history insert fails");
  it.todo("payroll salary lookup uses employee_salary_history as the source of truth");
  it.todo("payroll returns EMPLOYEE_SALARY_MISSING when no active salary exists");
  it.todo("create employee form shows Salary Details section");
  it.todo("create employee request sends starting_salary object");
  it.todo("employee detail hides salary if user lacks salary permission");
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
  it.todo("salary change closes the previous active salary one day before the new effective date");
  it.todo("salary change inserts a new active employee_salary_history row with change_type and reason");
  it.todo("salary overlap returns SALARY_OVERLAP and does not silently overwrite future records");
  it.todo("employees without salary history can only add starting salary or correction");
  it.todo("authorized HR users can add salary change from Employee Profile Salary & Compensation");
  it.todo("salary change form converts user-friendly major-unit input to integer minor units");
  it.todo("salary edit permissions include employees.salary.manage, employees.edit_salary, and payroll.manage");
  it.todo("salary view permissions include employees.salary.view, employees.view_salary, and payroll.view");
  it.todo("salary change audit is best-effort and includes old and new salary values with reason");
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
