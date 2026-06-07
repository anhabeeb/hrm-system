import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  validateCompensationDefinitionInput,
  validateCompensationComponentEndInput,
  validateCompensationComponentInput,
} from "../src/modules/employees/employees.validators";

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("employee compensation components", () => {
  it("adds employee-scoped compensation routes with salary/privacy permission aliases", () => {
    const routes = read("src/routes/employees.routes.ts");

    expect(routes).toContain("/:id/compensation-summary");
    expect(routes).toContain("/:id/compensation-components");
    expect(routes).toContain("/:id/compensation-components/:componentId");
    expect(routes).toContain("/:id/compensation-components/:componentId/end");
    expect(routes).toContain("employees.compensation.view");
    expect(routes).toContain("employees.compensation.manage");
    expect(routes).toContain("COMPENSATION_PERMISSION_DENIED");
    expect(routes).toContain("payroll.view");
    expect(routes).toContain("payroll.manage");
  });

  it("creates a forward-only schema for reusable definitions and employee components", () => {
    const migration = read("migrations/0024_employee_compensation_components.sql");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS compensation_component_definitions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS employee_compensation_components");
    expect(migration).toContain("component_type TEXT NOT NULL");
    expect(migration).toContain("calculation_type TEXT NOT NULL");
    expect(migration).toContain("affects_gross_pay");
    expect(migration).toContain("affects_net_pay");
    expect(migration).toContain("effective_from");
    expect(migration).toContain("effective_to");
    expect(migration).toContain("approval_request_id");
    expect(migration).toContain("idx_employee_comp_components_employee_status");
    expect(migration).not.toContain("DROP TABLE employee_salary_history");
  });

  it("creates immutable compensation approval application mappings", () => {
    const migration = read("migrations/0026_compensation_approval_applications.sql");
    const repository = read("src/modules/employees/employees.repository.ts");
    const verifier = read("scripts/verify-compensation-schema.mjs");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS compensation_approval_applications");
    expect(migration).toContain("approval_request_id TEXT NOT NULL");
    expect(migration).toContain("action_type TEXT NOT NULL CHECK (action_type IN ('create', 'change', 'end'))");
    expect(migration).toContain("idx_compensation_approval_applications_request_unique");
    expect(migration).toContain("INSERT OR IGNORE INTO compensation_approval_applications");
    expect(repository).toContain("createCompensationApprovalApplication");
    expect(repository).toContain("listCompensationApprovalApplicationsForComponent");
    expect(verifier).toContain("compensation_approval_applications");
    expect(verifier).toContain("idx_compensation_approval_applications_request_unique");
  });

  it("validates fixed allowances in integer minor units", () => {
    const input = validateCompensationComponentInput({
      component_type: "allowance",
      component_name: "Housing Allowance",
      amount: 150000,
      currency: "mvr",
      calculation_type: "fixed_amount",
      affects_gross_pay: true,
      affects_net_pay: true,
      effective_from: "2026-08-01",
      reason: "Housing allowance added",
    });

    expect(input.component_type).toBe("allowance");
    expect(input.currency).toBe("MVR");
    expect(input.amount).toBe(150000);
    expect(input.affects_gross_pay).toBe(true);
    expect(input.affects_net_pay).toBe(true);
  });

  it("validates non-cash benefits without payroll cash flags", () => {
    const input = validateCompensationComponentInput({
      component_type: "benefit",
      component_name: "Accommodation Benefit",
      amount: 250000,
      calculation_type: "non_cash_benefit",
      effective_from: "2026-08-01",
      reason: "Accommodation provided by company",
    });

    expect(input.component_type).toBe("benefit");
    expect(input.calculation_type).toBe("non_cash_benefit");
    expect(input.affects_gross_pay).toBe(false);
    expect(input.affects_net_pay).toBe(false);
  });

  it("validates recurring deductions separately from advances and loans", () => {
    const input = validateCompensationComponentInput({
      component_type: "deduction",
      component_name: "Accommodation Deduction",
      amount: 50000,
      calculation_type: "fixed_amount",
      affects_gross_pay: false,
      affects_net_pay: true,
      effective_from: "2026-08-01",
      reason: "Recurring accommodation contribution",
    });

    expect(input.component_type).toBe("deduction");
    expect(input.affects_net_pay).toBe(true);
  });

  it("rejects invalid amounts, invalid percentages, missing dates, and missing reasons", () => {
    expect(() => validateCompensationComponentInput({
      component_type: "allowance",
      component_name: "Housing Allowance",
      amount: 0,
      calculation_type: "fixed_amount",
      effective_from: "2026-08-01",
      reason: "Housing allowance added",
    })).toThrow(/amount/i);

    expect(() => validateCompensationComponentInput({
      component_type: "allowance",
      component_name: "Responsibility Allowance",
      amount: 1001,
      calculation_type: "percentage_of_basic_salary",
      effective_from: "2026-08-01",
      reason: "Additional supervisory responsibility",
    })).toThrow(/percentage/i);

    expect(() => validateCompensationComponentInput({
      component_type: "allowance",
      component_name: "Phone Allowance",
      amount: 10000,
      calculation_type: "fixed_amount",
      reason: "Phone allowance added",
    })).toThrow(/effective date/i);

    expect(() => validateCompensationComponentEndInput({
      effective_to: "2026-08-31",
      reason: "",
    })).toThrow(/reason/i);
  });

  it("preserves compensation history by closing and inserting component versions", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const repository = read("src/modules/employees/employees.repository.ts");

    expect(service).toContain("COMPENSATION_COMPONENT_OVERLAP");
    expect(service).toContain("COMPENSATION_COMPONENT_DUPLICATE");
    expect(service).toContain("COMPENSATION_FINALIZED_PERIOD_LOCKED");
    expect(service).toContain("createCompensationComponentVersion");
    expect(service).toContain("closed_previous_component_id");
    expect(repository).toContain("SET effective_to = ?, status = ?");
    expect(service).toContain("previousStatus: storedCompensationStatusForDate");
    expect(repository).toContain("status NOT IN ('cancelled', 'pending_approval')");
    expect(repository).toContain("updated_at = ?");
    expect(repository).toContain("const [insertResult, closeResult] = await env.DB.batch");
    expect(repository).toContain("changed: (insertResult.meta?.changes ?? 0) === 1 && (closeResult.meta?.changes ?? 0) === 1");
    expect(service).toContain("COMPENSATION_STATE_CHANGED");
  });

  it("calculates gross and net summary effects independently without double counting", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const types = read("src/modules/employees/employees.types.ts");
    const frontendTypes = read("frontend/src/features/employees/employees.types.ts");

    expect(types).toContain("recurring_gross_additions");
    expect(types).toContain("recurring_gross_deductions");
    expect(types).toContain("recurring_net_additions");
    expect(types).toContain("recurring_net_deductions");
    expect(frontendTypes).toContain("recurring_gross_additions");
    expect(service).toContain("recurring_cash_allowances");
    expect(service).toContain("recurring_cash_benefits");
    expect(service).toContain("recurring_cash_deductions");
    expect(service).toContain("non_cash_benefits");
    expect(service).toContain("estimated_recurring_net_before_variable_items");
    expect(service).toContain("estimatedRecurringGrossPay = basicSalary + recurringGrossAdditions - recurringGrossDeductions");
    expect(service).toContain("estimatedRecurringNet = basicSalary + recurringNetAdditions - recurringNetDeductions");
    expect(service).toContain("if (effectiveComponent.affects_gross_pay === 1) recurringGrossAdditions += calculatedAmount");
    expect(service).toContain("if (effectiveComponent.affects_net_pay === 1) recurringNetAdditions += calculatedAmount");
    expect(service).toContain("if (effectiveComponent.affects_gross_pay === 1) recurringGrossDeductions += calculatedAmount");
    expect(service).toContain("if (effectiveComponent.affects_net_pay === 1) recurringNetDeductions += calculatedAmount");
    expect(service).toContain("if (isNonCashBenefit)");
    expect(service).toContain("Estimated recurring compensation before variable payroll items.");
  });

  it("rejects mixed-currency compensation until currency conversion exists", () => {
    const service = read("src/modules/employees/employees.service.ts");

    expect(service).toContain("ensureCompensationCurrencyMatchesSalary");
    expect(service).toContain("COMPENSATION_CURRENCY_MISMATCH");
    expect(service).toContain("Compensation component currency must match the employee salary currency.");
    expect(service).toContain("Compensation summary cannot combine different currencies.");
  });

  it("adds company-level compensation definition APIs and settings UI", () => {
    const app = read("src/app.ts");
    const routes = read("src/routes/compensation-component-definitions.routes.ts");
    const settings = read("frontend/src/features/settings/payroll/CompensationDefinitionsPanel.tsx");
    const payrollPage = read("frontend/src/features/settings/payroll/PayrollSettingsPage.tsx");

    expect(app).toContain("/compensation-component-definitions");
    expect(routes).toContain("compensationComponentDefinitionsRoutes.get");
    expect(routes).toContain("compensationComponentDefinitionsRoutes.post");
    expect(routes).toContain("/:id/enable");
    expect(routes).toContain("/:id/disable");
    expect(settings).toContain("Compensation Components");
    expect(settings).toContain("compensationDefinitionsApi.create");
    expect(payrollPage).toContain("CompensationDefinitionsPanel");
  });

  it("connects compensation definitions to the employee component form", () => {
    const api = read("frontend/src/features/employees/employees.api.ts");
    const panel = read("frontend/src/features/employees/EmployeeSalaryHistoryPanel.tsx");

    expect(api).toContain("compensationDefinitionsApi");
    expect(panel).toContain("Component definition");
    expect(panel).toContain("applyDefinition");
    expect(panel).toContain("component_definition_id");
    expect(panel).toContain("Custom component");
  });

  it("validates reusable component definitions without requiring employee effective dates", () => {
    const input = validateCompensationDefinitionInput({
      component_type: "allowance",
      component_code: "HOUSING",
      component_name: "Housing Allowance",
      default_amount: 150000,
      calculation_type: "fixed_amount",
      affects_gross_pay: true,
      affects_net_pay: true,
      reason: "Creating reusable housing allowance",
    });

    expect(input.component_code).toBe("HOUSING");
    expect(input.default_amount).toBe(150000);
    expect(input.currency).toBe("MVR");
  });

  it("integrates compensation approvals with the hardened approval target apply path", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const integration = read("src/modules/approvals/approval-integration.service.ts");
    const settings = read("src/services/settings.service.ts");

    expect(settings).toContain("compensation_component_approval_enabled");
    expect(service).toContain("createCompensationApprovalIfRequired");
    expect(service).toContain("COMPENSATION_COMPONENT_APPROVAL_REQUESTED");
    expect(service).toContain("applyApprovedCompensationApproval");
    expect(service).toContain("findAppliedCompensationApproval");
    expect(service).toContain("approval_request_id");
    expect(integration).toContain("request.module === \"compensation\"");
  });

  it("rejects inactive/stale compensation transitions and approval applications", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const repository = read("src/modules/employees/employees.repository.ts");

    expect(service).toContain("assertCompensationComponentTransitionable(existing)");
    expect(service).toContain("COMPENSATION_COMPONENT_NOT_ACTIVE");
    expect(service).toContain("assertCompensationExpectedStateMatches");
    expect(service).toContain("APPROVAL_REQUEST_STALE");
    expect(service).toContain("expected_current_component");
    expect(repository).toContain("AND effective_from = ?");
    expect(repository).toContain("AND COALESCE(effective_to, '') = COALESCE(?, '')");
    expect(repository).toContain("AND amount = ?");
    expect(repository).toContain("AND calculation_type = ?");
  });

  it("surfaces pending compensation approvals in employee and approval UIs", () => {
    const panel = read("frontend/src/features/employees/EmployeeSalaryHistoryPanel.tsx");
    const drawer = read("frontend/src/features/approvals/ApprovalDetailDrawer.tsx");
    const api = read("frontend/src/features/employees/employees.api.ts");

    expect(panel).toContain("module: \"compensation\"");
    expect(panel).toContain("Pending Compensation Changes");
    expect(panel).toContain("pendingCompensationApprovals");
    expect(drawer).toContain("const compensationRows");
    expect(drawer).toContain("Current value");
    expect(drawer).toContain("Proposed value");
    expect(drawer).toContain("Gross effect");
    expect(drawer).toContain("Net effect");
    expect(api).toContain("EmployeeCompensationComponentMutationResponse");
  });

  it("uses a dialog rather than browser prompts for ending employee components", () => {
    const panel = read("frontend/src/features/employees/EmployeeSalaryHistoryPanel.tsx");

    expect(panel).toContain("End compensation component");
    expect(panel).toContain("submitEndComponent");
    expect(panel).toContain("Future-dated endings keep the component active until the effective end date.");
    expect(panel).not.toContain("Enter the end date for this compensation component");
  });

  it("exposes a payroll preparation helper for active components by payroll date", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const repository = read("src/modules/employees/employees.repository.ts");

    expect(service).toContain("getActiveEmployeeCompensationComponents");
    expect(repository).toContain("findActiveCompensationComponentsForDate");
    expect(repository).toContain("effective_from <= ?");
    expect(repository).toContain("(effective_to IS NULL OR effective_to >= ?)");
  });

  it("connects the employee Salary & Compensation UI to summary and component endpoints", () => {
    const api = read("frontend/src/features/employees/employees.api.ts");
    const panel = read("frontend/src/features/employees/EmployeeSalaryHistoryPanel.tsx");

    expect(api).toContain("compensationSummary");
    expect(api).toContain("compensationComponents");
    expect(api).toContain("addCompensationComponent");
    expect(api).toContain("changeCompensationComponent");
    expect(api).toContain("endCompensationComponent");
    expect(panel).toContain("Current compensation summary");
    expect(panel).toContain("Active Compensation Components");
    expect(panel).toContain("Compensation History");
    expect(panel).toContain("Non-cash benefit");
    expect(panel).toContain("This is not final payroll net.");
  });

  it("keeps general employee list APIs free from compensation details", () => {
    const repository = read("src/modules/employees/employees.repository.ts");
    const listEmployeesSection = repository.slice(
      repository.indexOf("export const listEmployees"),
      repository.indexOf("export const findEmployeeById"),
    );

    expect(listEmployeesSection).not.toContain("employee_compensation_components");
    expect(listEmployeesSection).not.toContain("compensation_component_definitions");
  });
});
