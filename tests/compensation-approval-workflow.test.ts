import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createApprovedCompensationComponent,
  changeApprovedCompensationComponent,
  endApprovedCompensationComponent,
} from "../src/modules/employees/employees.repository";
import { assertCompensationApprovalApplicationMatchesRequest } from "../src/modules/employees/employees.service";

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("compensation approval workflow hardening", () => {
  it("stores reviewed component state on compensation approval requests", () => {
    const service = read("src/modules/employees/employees.service.ts");

    expect(service).toContain("expected_current_component: compensationExpectedState(existing)");
    expect(service).toContain("current_component: existing");
    expect(service).toContain("approval_action: \"compensation_component_change\"");
    expect(service).toContain("approval_action: \"compensation_component_end\"");
  });

  it("rejects stale approved compensation changes before applying mutations", () => {
    const service = read("src/modules/employees/employees.service.ts");

    expect(service).toContain("assertCompensationExpectedStateMatches(");
    expect(service).toContain("payload.expected_current_component ?? payload.current_component");
    expect(service).toContain("throw compensationStateChangedError(true)");
    expect(service).toContain("APPROVAL_REQUEST_STALE");
    expect(service).toContain("reason_code: \"COMPENSATION_STATE_CHANGED\"");
  });

  it("keeps compensation approval application idempotent", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const repository = read("src/modules/employees/employees.repository.ts");

    expect(service).toContain("findAppliedCompensationApprovalTarget(env, context, request.id, payload)");
    expect(service).toContain("findCompensationApprovalApplication(");
    expect(service).toContain("recordCompensationApprovalApplication");
    expect(service).toContain("approval_application");
    expect(service).toContain("already_applied: true");
    expect(repository).toContain("INSERT OR IGNORE INTO compensation_approval_applications");
    expect(repository).toContain("createApprovedCompensationComponent");
    expect(repository).toContain("changeApprovedCompensationComponent");
    expect(repository).toContain("endApprovedCompensationComponent");
    expect(repository).toContain("WHERE company_id = ? AND approval_request_id = ? LIMIT 1");
  });

  const createFakeEnv = (options: { failMapping?: boolean; zeroMutation?: boolean } = {}) => {
    const prepared: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const statement = {
          sql,
          values: [] as unknown[],
          bind(...values: unknown[]) {
            statement.values = values;
            prepared.push({ sql, values });
            return statement;
          },
          run: async () => ({ meta: { changes: 1 } }),
          first: async () => null,
          all: async () => ({ results: [] }),
        };
        return statement;
      },
      batch: async (statements: Array<{ sql: string }>) => {
        if (options.failMapping && statements.some((statement) => statement.sql.includes("compensation_approval_applications"))) {
          throw new Error("D1_ERROR: UNIQUE constraint failed: compensation_approval_applications.approval_request_id");
        }
        return statements.map((statement) => ({
          meta: {
            changes:
              options.zeroMutation && statement.sql.includes("employee_compensation_components")
                ? 0
                : 1,
          },
        }));
      },
    };

    return { env: { DB: db } as never, prepared };
  };

  const approvedComponentInput = {
    component_type: "allowance" as const,
    component_code: "HOUSING",
    component_name: "Housing Allowance",
    amount: 150000,
    currency: "MVR",
    calculation_type: "fixed_amount" as const,
    affects_gross_pay: true,
    affects_net_pay: true,
    effective_from: "2026-08-01",
    reason: "Approved housing allowance",
  };

  const expectedCurrent = {
    status: "active",
    effectiveFrom: "2026-08-01",
    effectiveTo: null,
    amount: 150000,
    currency: "MVR",
    calculationType: "fixed_amount",
    affectsGrossPay: 1,
    affectsNetPay: 1,
    revision: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const baseComponent = {
    id: "comp_created",
    company_id: "company_1",
    employee_id: "emp_1",
    component_definition_id: null,
    component_type: "allowance" as const,
    component_code: "HOUSING",
    component_name: "Housing Allowance",
    category: null,
    amount: 150000,
    currency: "MVR",
    calculation_type: "fixed_amount" as const,
    affects_gross_pay: 1,
    affects_net_pay: 1,
    effective_from: "2026-08-01",
    effective_to: null,
    status: "active" as const,
    revision: 1,
    reason: "Approved housing allowance",
    notes: null,
    approval_request_id: "approval_create",
    created_by: "user_1",
    created_at: "2026-08-02T00:00:00.000Z",
    updated_by: "user_1",
    updated_at: "2026-08-02T00:00:00.000Z",
  };

  const baseApplication = {
    id: "comp_app_create",
    company_id: "company_1",
    approval_request_id: "approval_create",
    employee_id: "emp_1",
    component_id: "comp_created",
    action_type: "create" as const,
    applied_at: "2026-08-02T00:00:00.000Z",
    created_at: "2026-08-02T00:00:00.000Z",
  };

  const createPayload = {
    approval_action: "compensation_component_create" as const,
    employee_id: "emp_1",
    proposed_component: approvedComponentInput,
    requested_by: "user_1",
  };

  const changePayload = {
    approval_action: "compensation_component_change" as const,
    employee_id: "emp_1",
    component_id: "comp_original",
    proposed_component: { ...approvedComponentInput, amount: 175000, effective_from: "2026-09-01" },
    requested_by: "user_1",
  };

  const endPayload = {
    approval_action: "compensation_component_end" as const,
    employee_id: "emp_1",
    component_id: "comp_created",
    end_component: { effective_to: "2026-10-31", reason: "Approved end" },
    requested_by: "user_1",
  };

  it("accepts matching immutable create mappings as already applied", () => {
    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: baseApplication,
      component: baseComponent,
      approvalRequestId: "approval_create",
      companyId: "company_1",
      payload: createPayload,
    })).not.toThrow();
  });

  it("accepts matching immutable change mappings for the replacement target", () => {
    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: {
        ...baseApplication,
        id: "comp_app_change",
        approval_request_id: "approval_change",
        component_id: "comp_replacement",
        action_type: "change",
      },
      component: {
        ...baseComponent,
        id: "comp_replacement",
        approval_request_id: "approval_change",
        amount: 175000,
      },
      approvalRequestId: "approval_change",
      companyId: "company_1",
      payload: changePayload,
    })).not.toThrow();
  });

  it("accepts matching immutable end mappings without requiring the component approval_request_id to be the end approval", () => {
    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: {
        ...baseApplication,
        id: "comp_app_end",
        approval_request_id: "approval_end",
        action_type: "end",
      },
      component: {
        ...baseComponent,
        status: "ended",
        effective_to: "2026-10-31",
        approval_request_id: "approval_create",
      },
      approvalRequestId: "approval_end",
      companyId: "company_1",
      payload: endPayload,
    })).not.toThrow();
  });

  it("rejects immutable mappings with the wrong employee", () => {
    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: { ...baseApplication, employee_id: "emp_other" },
      component: baseComponent,
      approvalRequestId: "approval_create",
      companyId: "company_1",
      payload: createPayload,
    })).toThrow(/already been applied/);
  });

  it("rejects immutable mappings with the wrong action type", () => {
    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: { ...baseApplication, action_type: "end" },
      component: baseComponent,
      approvalRequestId: "approval_create",
      companyId: "company_1",
      payload: createPayload,
    })).toThrow(/already been applied/);
  });

  it("rejects cross-company or incompatible component mappings", () => {
    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: baseApplication,
      component: { ...baseComponent, company_id: "company_other" },
      approvalRequestId: "approval_create",
      companyId: "company_1",
      payload: createPayload,
    })).toThrow(/already been applied/);

    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: { ...baseApplication, component_id: "comp_other" },
      component: baseComponent,
      approvalRequestId: "approval_create",
      companyId: "company_1",
      payload: createPayload,
    })).toThrow(/already been applied/);
  });

  it("rejects end mappings that point to another component", () => {
    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: {
        ...baseApplication,
        approval_request_id: "approval_end",
        component_id: "comp_other",
        action_type: "end",
      },
      component: { ...baseComponent, id: "comp_other" },
      approvalRequestId: "approval_end",
      companyId: "company_1",
      payload: endPayload,
    })).toThrow(/already been applied/);
  });

  it("rejects create and change mappings whose target was not created by that approval", () => {
    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: baseApplication,
      component: { ...baseComponent, approval_request_id: "approval_other" },
      approvalRequestId: "approval_create",
      companyId: "company_1",
      payload: createPayload,
    })).toThrow(/already been applied/);

    expect(() => assertCompensationApprovalApplicationMatchesRequest({
      application: {
        ...baseApplication,
        approval_request_id: "approval_change",
        component_id: "comp_replacement",
        action_type: "change",
      },
      component: {
        ...baseComponent,
        id: "comp_replacement",
        approval_request_id: "approval_other",
      },
      approvalRequestId: "approval_change",
      companyId: "company_1",
      payload: changePayload,
    })).toThrow(/already been applied/);
  });

  it("approved create batches component insertion and immutable mapping together", async () => {
    const { env, prepared } = createFakeEnv();

    const result = await createApprovedCompensationComponent(env, {
      id: "comp_created",
      applicationId: "comp_app_create",
      companyId: "company_1",
      employeeId: "emp_1",
      component: approvedComponentInput,
      status: "active",
      actorUserId: "user_1",
      approvalRequestId: "approval_create",
      appliedAt: "2026-08-02T00:00:00.000Z",
    });

    expect(result.changed).toBe(true);
    expect(prepared.some((statement) => statement.sql.includes("employee_compensation_components"))).toBe(true);
    expect(prepared.some((statement) => statement.sql.includes("compensation_approval_applications"))).toBe(true);
    expect(prepared.some((statement) => statement.sql.includes("'create'"))).toBe(true);
  });

  it("approved create mapping failure rejects the batch instead of silently succeeding", async () => {
    const { env } = createFakeEnv({ failMapping: true });

    await expect(createApprovedCompensationComponent(env, {
      id: "comp_created",
      applicationId: "comp_app_create",
      companyId: "company_1",
      employeeId: "emp_1",
      component: approvedComponentInput,
      status: "active",
      actorUserId: "user_1",
      approvalRequestId: "approval_create",
      appliedAt: "2026-08-02T00:00:00.000Z",
    })).rejects.toThrow(/compensation_approval_applications/);
  });

  it("approved change batches replacement, close-old update, and immutable mapping together", async () => {
    const { env, prepared } = createFakeEnv();

    const result = await changeApprovedCompensationComponent(env, {
      previousId: "comp_old",
      newId: "comp_new",
      applicationId: "comp_app_change",
      companyId: "company_1",
      employeeId: "emp_1",
      component: { ...approvedComponentInput, amount: 175000, effective_from: "2026-09-01" },
      closePreviousEffectiveTo: "2026-08-31",
      previousStatus: "ended",
      status: "active",
      actorUserId: "user_1",
      approvalRequestId: "approval_change",
      appliedAt: "2026-09-02T00:00:00.000Z",
      expectedCurrent,
    });

    expect(result.changed).toBe(true);
    expect(prepared.filter((statement) => statement.sql.includes("employee_compensation_components")).length).toBeGreaterThanOrEqual(2);
    expect(prepared.some((statement) => statement.sql.includes("compensation_approval_applications"))).toBe(true);
    expect(prepared.some((statement) => statement.sql.includes("'change'"))).toBe(true);
  });

  it("approved change mapping failure rejects the batch before a false success", async () => {
    const { env } = createFakeEnv({ failMapping: true });

    await expect(changeApprovedCompensationComponent(env, {
      previousId: "comp_old",
      newId: "comp_new",
      applicationId: "comp_app_change",
      companyId: "company_1",
      employeeId: "emp_1",
      component: { ...approvedComponentInput, amount: 175000, effective_from: "2026-09-01" },
      closePreviousEffectiveTo: "2026-08-31",
      previousStatus: "ended",
      status: "active",
      actorUserId: "user_1",
      approvalRequestId: "approval_change",
      appliedAt: "2026-09-02T00:00:00.000Z",
      expectedCurrent,
    })).rejects.toThrow(/compensation_approval_applications/);
  });

  it("approved end batches component ending and immutable mapping together", async () => {
    const { env, prepared } = createFakeEnv();

    const result = await endApprovedCompensationComponent(env, {
      applicationId: "comp_app_end",
      companyId: "company_1",
      employeeId: "emp_1",
      componentId: "comp_new",
      component: { effective_to: "2026-10-31", reason: "Approved end" },
      actorUserId: "user_1",
      status: "ended",
      approvalRequestId: "approval_end",
      appliedAt: "2026-10-15T00:00:00.000Z",
      expectedCurrent: { ...expectedCurrent, effectiveFrom: "2026-09-01", updatedAt: "2026-09-02T00:00:00.000Z" },
    });

    expect(result.changed).toBe(true);
    expect(prepared.some((statement) => statement.sql.includes("UPDATE employee_compensation_components"))).toBe(true);
    expect(prepared.some((statement) => statement.sql.includes("compensation_approval_applications"))).toBe(true);
    expect(prepared.some((statement) => statement.sql.includes("'end'"))).toBe(true);
    expect(prepared.some((statement) => statement.sql.includes("approval_request_id = COALESCE"))).toBe(false);
  });

  it("approved end mapping failure rejects the batch instead of reporting an applied end", async () => {
    const { env } = createFakeEnv({ failMapping: true });

    await expect(endApprovedCompensationComponent(env, {
      applicationId: "comp_app_end",
      companyId: "company_1",
      employeeId: "emp_1",
      componentId: "comp_new",
      component: { effective_to: "2026-10-31", reason: "Approved end" },
      actorUserId: "user_1",
      status: "ended",
      approvalRequestId: "approval_end",
      appliedAt: "2026-10-15T00:00:00.000Z",
      expectedCurrent: { ...expectedCurrent, effectiveFrom: "2026-09-01", updatedAt: "2026-09-02T00:00:00.000Z" },
    })).rejects.toThrow(/compensation_approval_applications/);
  });

  it("records immutable mappings for approved create, change, and end actions", () => {
    const service = read("src/modules/employees/employees.service.ts");
    const migration = read("migrations/0026_compensation_approval_applications.sql");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS compensation_approval_applications");
    expect(migration).toContain("action_type TEXT NOT NULL CHECK (action_type IN ('create', 'change', 'end'))");
    expect(migration).toContain("idx_compensation_approval_applications_request_unique");
    expect(service).toContain("if (action === \"compensation_component_create\") return \"create\"");
    expect(service).toContain("if (action === \"compensation_component_change\") return \"change\"");
    expect(service).toContain("return \"end\"");
  });

  it("does not overwrite component approval_request_id when ending via approval", () => {
    const repository = read("src/modules/employees/employees.repository.ts");
    const service = read("src/modules/employees/employees.service.ts");

    expect(repository).not.toContain("approval_request_id = COALESCE(?, approval_request_id)");
    expect(service).toContain("componentId: payload.component_id");
    expect(service).toContain("actionType");
    expect(service).toContain("approvalRequestId: request.id");
  });

  it("prefers immutable mappings over legacy component approval_request_id recovery", () => {
    const service = read("src/modules/employees/employees.service.ts");

    const findAppliedStart = service.indexOf("export const findAppliedCompensationApproval");
    const findAppliedSection = service.slice(findAppliedStart, findAppliedStart + 1400);
    expect(findAppliedSection).toContain("findAppliedCompensationApprovalTarget(env, context, request.id, payload)");
    expect(findAppliedSection).toContain("if (mapped) return mapped");
    expect(findAppliedSection).toContain("findCompensationComponentByApprovalRequestId");
    expect(findAppliedSection.indexOf("findAppliedCompensationApprovalTarget")).toBeLessThan(
      findAppliedSection.indexOf("findCompensationComponentByApprovalRequestId"),
    );
  });

  it("backfills only safely identifiable legacy compensation approval rows", () => {
    const migration = read("migrations/0026_compensation_approval_applications.sql");

    expect(migration).toContain("json_extract(ar.payload_json, '$.approval_action')");
    expect(migration).toContain("WHEN 'compensation_component_create' THEN 'create'");
    expect(migration).toContain("WHEN 'compensation_component_change' THEN 'change'");
    expect(migration).toContain("WHEN 'compensation_component_end' THEN 'end'");
    expect(migration).toContain("Backfill review query for skipped legacy compensation approval rows");
  });

  it("does not let pending compensation approvals affect active summary queries", () => {
    const repository = read("src/modules/employees/employees.repository.ts");

    expect(repository).toContain("findActiveCompensationComponentsForDate");
    expect(repository).toContain("status NOT IN ('cancelled', 'pending_approval')");
    expect(repository).toContain("effective_from <= ?");
    expect(repository).toContain("(effective_to IS NULL OR effective_to >= ?)");
  });

  it("shows compensation approvals as readable business details before raw payloads", () => {
    const drawer = read("frontend/src/features/approvals/ApprovalDetailDrawer.tsx");

    expect(drawer).toContain("approval.module === \"compensation\"");
    expect(drawer).toContain("const compensationRows");
    expect(drawer).toContain("Component type");
    expect(drawer).toContain("Current value");
    expect(drawer).toContain("Proposed value");
    expect(drawer).toContain("Effective date");
    expect(drawer).toContain("Safe Technical Payload");
  });
});
