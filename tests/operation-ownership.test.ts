import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    countBusinessFunctions: vi.fn(),
    listBusinessFunctions: vi.fn(),
    findBusinessFunctionById: vi.fn(),
    findBusinessFunctionByCode: vi.fn(),
    createBusinessFunction: vi.fn(),
    updateBusinessFunction: vi.fn(),
    setBusinessFunctionStatus: vi.fn(),
    countFunctionAssignments: vi.fn(),
    listFunctionAssignments: vi.fn(),
    findFunctionAssignmentById: vi.fn(),
    createFunctionAssignment: vi.fn(),
    updateFunctionAssignment: vi.fn(),
    setFunctionAssignmentStatus: vi.fn(),
    countOperations: vi.fn(),
    listOperations: vi.fn(),
    findOperationByCode: vi.fn(),
    findCompanyOperationByCode: vi.fn(),
    createOperation: vi.fn(),
    updateOperation: vi.fn(),
    setOperationStatus: vi.fn(),
    countResponsibilities: vi.fn(),
    listResponsibilities: vi.fn(),
    findResponsibilityById: vi.fn(),
    findActiveResponsibilities: vi.fn(),
    createResponsibility: vi.fn(),
    updateResponsibility: vi.fn(),
    setResponsibilityStatus: vi.fn(),
    findDepartment: vi.fn(),
    findEmployeeStructure: vi.fn(),
    findRole: vi.fn(),
    findUser: vi.fn(),
    findPrimaryFunctionAssignment: vi.fn(),
    getMatrixSummary: vi.fn(),
    listUnassignedOperations: vi.fn(),
    listFunctionsWithoutAssignments: vi.fn(),
    listOperationsWithoutOwner: vi.fn(),
    listSensitiveOperationsWithoutFinalApproval: vi.fn(),
    listFunctionAssignmentsWithInactiveDepartments: vi.fn(),
    listResponsibilitiesWithInactiveDepartments: vi.fn(),
    listResponsibilitiesWithDisabledUsers: vi.fn(),
    listResponsibilitiesWithFallbacks: vi.fn(),
    listSensitiveFinalApprovalsWithoutPermission: vi.fn(),
    listFinalApprovalResponsibilitiesWithoutLevelApprover: vi.fn(),
    findSuperAdminUser: vi.fn(),
    listDepartmentApproversForOperation: vi.fn(),
  },
  audit: {
    createAuditLog: vi.fn(),
  },
  permission: {
    hasAnyPermission: vi.fn(),
    hasPermission: vi.fn(),
    isSuperAdmin: vi.fn(),
  },
}));

vi.mock("../src/modules/operation-ownership/operation-ownership.repository", () => mocks.repository);
vi.mock("../src/services/audit.service", () => mocks.audit);
vi.mock("../src/services/permission.service", () => mocks.permission);

import * as service from "../src/modules/operation-ownership/operation-ownership.service";
import type { AuthActor } from "../src/types/api.types";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const env = {} as Env;
const actor: AuthActor = {
  actorUserId: "user_admin",
  fullName: "Admin",
  email: "admin@example.com",
  companyId: "company_1",
  roles: ["Admin"],
  permissions: ["operationOwnership.manage", "operationOwnership.matrix.manage", "operationOwnership.sensitive.manage"],
  roleKeys: ["admin"],
  outletIds: [],
  isSuperAdmin: false,
  isAdmin: true,
  requestId: "req_test",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

const operation = (overrides: Record<string, unknown> = {}) => ({
  id: "op_1",
  company_id: null,
  operation_code: "LEAVE_REQUEST",
  operation_name: "Leave Request",
  module_key: "leave",
  description: null,
  default_business_function_code: "HR_FUNCTION",
  is_sensitive: 0,
  requires_final_approval: 1,
  is_active: 1,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  created_by: null,
  updated_by: null,
  ...overrides,
});

const businessFunction = (overrides: Record<string, unknown> = {}) => ({
  id: "bf_hr",
  company_id: null,
  code: "HR_FUNCTION",
  name: "HR Function",
  description: null,
  is_system_default: 1,
  is_sensitive: 0,
  is_active: 1,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  created_by: null,
  updated_by: null,
  ...overrides,
});

const responsibility = (overrides: Record<string, unknown> = {}) => ({
  id: "orm_1",
  company_id: "company_1",
  operation_code: "LEAVE_REQUEST",
  responsibility_type: "OWNER",
  target_type: "DEPARTMENT",
  business_function_id: null,
  business_function_code: null,
  department_id: "dept_hr",
  role_id: null,
  user_id: null,
  permission_key: null,
  min_level: null,
  max_level: null,
  required_permission: null,
  required_role_id: null,
  requires_approval: 0,
  use_requester_department: 0,
  use_subject_department: 0,
  fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  priority: 100,
  is_required: 1,
  is_active: 1,
  archived_at: null,
  effective_from: null,
  effective_to: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const validResponsibilityInput = (overrides: Record<string, unknown> = {}) => ({
  operation_code: "LEAVE_REQUEST",
  responsibility_type: "OWNER",
  target_type: "DEPARTMENT",
  department_id: "dept_hr",
  fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.audit.createAuditLog.mockResolvedValue({ created: true });
  mocks.permission.hasAnyPermission.mockReturnValue(true);
  mocks.permission.hasPermission.mockReturnValue(true);
  mocks.permission.isSuperAdmin.mockReturnValue(false);
  mocks.repository.findOperationByCode.mockResolvedValue(operation());
  mocks.repository.findBusinessFunctionById.mockResolvedValue(businessFunction());
  mocks.repository.findDepartment.mockResolvedValue({ id: "dept_hr", name: "HR", status: "active", is_active: 1, archived_at: null, deleted_at: null });
  mocks.repository.findRole.mockResolvedValue({ id: "role_hr", role_name: "HR", is_active: 1 });
  mocks.repository.findUser.mockResolvedValue({ id: "user_specific", username: "specific", status: "active", deleted_at: null, employee_id: "emp_specific" });
  mocks.repository.findResponsibilityById.mockResolvedValue(responsibility());
  mocks.repository.listUnassignedOperations.mockResolvedValue([]);
  mocks.repository.listFunctionsWithoutAssignments.mockResolvedValue([]);
  mocks.repository.listOperationsWithoutOwner.mockResolvedValue([]);
  mocks.repository.listSensitiveOperationsWithoutFinalApproval.mockResolvedValue([]);
  mocks.repository.listFunctionAssignmentsWithInactiveDepartments.mockResolvedValue([]);
  mocks.repository.listResponsibilitiesWithInactiveDepartments.mockResolvedValue([]);
  mocks.repository.listResponsibilitiesWithDisabledUsers.mockResolvedValue([]);
  mocks.repository.listResponsibilitiesWithFallbacks.mockResolvedValue([]);
  mocks.repository.listSensitiveFinalApprovalsWithoutPermission.mockResolvedValue([]);
  mocks.repository.listFinalApprovalResponsibilitiesWithoutLevelApprover.mockResolvedValue([]);
});

describe("operation ownership schema and catalog completion", () => {
  it("adds completed responsibility matrix columns in an additive migration", () => {
    const migration = read("migrations/0066_operation_ownership_matrix_completion.sql");
    expect(migration).toContain("ADD COLUMN target_type TEXT");
    expect(migration).toContain("ADD COLUMN min_level INTEGER");
    expect(migration).toContain("ADD COLUMN max_level INTEGER");
    expect(migration).toContain("ADD COLUMN required_permission TEXT");
    expect(migration).toContain("ADD COLUMN required_role_id TEXT");
    expect(migration).toContain("ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("ADD COLUMN use_requester_department INTEGER NOT NULL DEFAULT 0");
    expect(migration).toContain("ADD COLUMN use_subject_department INTEGER NOT NULL DEFAULT 0");
  });

  it("seeds all canonical operation codes", () => {
    const catalog = `${read("migrations/0065_operation_ownership_responsibility_matrix.sql")}\n${read("migrations/0066_operation_ownership_matrix_completion.sql")}`;
    [
      "EMPLOYEE_CREATE",
      "EMPLOYEE_UPDATE",
      "EMPLOYEE_ARCHIVE",
      "EMPLOYEE_LOGIN_ASSIGNMENT",
      "EMPLOYEE_STRUCTURE_CHANGE",
      "EMPLOYEE_TRANSFER",
      "LEAVE_REQUEST",
      "LEAVE_BALANCE_ADJUSTMENT",
      "ATTENDANCE_CORRECTION",
      "ATTENDANCE_MANUAL_ENTRY",
      "ATTENDANCE_OVERRIDE",
      "ROSTER_CHANGE",
      "ROSTER_PUBLISH",
      "ROSTER_UNPUBLISH",
      "ROSTER_LOCK",
      "PAYROLL_ADJUSTMENT",
      "PAYROLL_RUN",
      "PAYROLL_FINALIZE",
      "PAYROLL_REOPEN",
      "ADVANCE_SALARY_REQUEST",
      "ADVANCE_SALARY_PAYMENT",
      "PAYSLIP_GENERATE",
      "PAYSLIP_PUBLISH",
      "DOCUMENT_KYC_UPDATE",
      "DOCUMENT_APPROVAL",
      "BIOMETRIC_DEVICE_CONFIG",
      "BIOMETRIC_EMPLOYEE_MAPPING",
      "BIOMETRIC_PUNCH_REPROCESS",
      "KIOSK_CONFIG",
      "REPORT_EXPORT",
      "AUDIT_LOG_VIEW",
      "SYSTEM_SETTINGS_CHANGE",
      "SECURITY_SETTINGS_CHANGE",
      "ROLE_PERMISSION_CHANGE",
      "RESIGNATION",
      "OFFBOARDING",
      "DISCIPLINARY_ACTION",
      "GENERIC_REQUEST",
    ].forEach((code) => expect(catalog).toContain(code));
  });

  it("supports completed responsibility and target type lists", () => {
    const types = read("src/modules/operation-ownership/operation-ownership.types.ts");
    ["REQUEST_REVIEW", "DEPARTMENT_REVIEW", "SECONDARY_APPROVAL", "AUDIT_VIEW", "FINAL_APPROVAL", "EXECUTION", "CONFIGURATION"].forEach((type) => {
      expect(types).toContain(type);
    });
    ["BUSINESS_FUNCTION", "DEPARTMENT", "SPECIFIC_USER", "REQUESTER_DEPARTMENT", "SUBJECT_DEPARTMENT", "SUPER_ADMIN"].forEach((targetType) => {
      expect(types).toContain(targetType);
    });
  });
});

describe("operation ownership responsibility validation", () => {
  it("creates a business function and blocks duplicate codes", async () => {
    mocks.repository.findBusinessFunctionByCode.mockResolvedValueOnce(null);
    mocks.repository.findBusinessFunctionById.mockResolvedValueOnce(businessFunction({ company_id: "company_1", is_system_default: 0 }));

    await expect(service.createBusinessFunction(env, actor, {
      code: "OPS_FUNCTION",
      name: "Operations Function",
      is_sensitive: false,
    })).resolves.toMatchObject({ business_function: expect.objectContaining({ code: "HR_FUNCTION" }) });
    expect(mocks.repository.createBusinessFunction).toHaveBeenCalled();

    mocks.repository.findBusinessFunctionByCode.mockResolvedValueOnce(businessFunction());
    await expect(service.createBusinessFunction(env, actor, { code: "HR_FUNCTION", name: "Duplicate" })).rejects.toThrow(/already in use/i);
  });

  it("updates and enables/disables/archives business functions", async () => {
    mocks.repository.findBusinessFunctionById.mockResolvedValue(businessFunction({ id: "bf_company", company_id: "company_1", is_system_default: 0 }));

    await service.updateBusinessFunction(env, actor, "bf_company", { name: "People Ops", is_active: true });
    expect(mocks.repository.updateBusinessFunction).toHaveBeenCalledWith(env, "company_1", "bf_company", "user_admin", expect.objectContaining({ name: "People Ops" }));

    await service.setBusinessFunctionStatus(env, actor, "bf_company", false);
    await service.setBusinessFunctionStatus(env, actor, "bf_company", true);
    await service.setBusinessFunctionStatus(env, actor, "bf_company", false, true);
    expect(mocks.repository.setBusinessFunctionStatus).toHaveBeenCalledTimes(3);
  });

  it("requires sensitive manage permission for sensitive business functions", async () => {
    mocks.permission.hasPermission.mockImplementation((_context, permission) => permission !== "operationOwnership.sensitive.manage");
    await expect(service.createBusinessFunction(env, actor, {
      code: "SECURITY_FUNCTION",
      name: "Security",
      is_sensitive: true,
    })).rejects.toThrow(/sensitive operation ownership/i);
  });

  it("creates function assignment to active department and rejects inactive departments", async () => {
    await service.createFunctionAssignment(env, actor, {
      business_function_id: "bf_hr",
      department_id: "dept_hr",
      is_primary: true,
    });
    expect(mocks.repository.createFunctionAssignment).toHaveBeenCalledWith(env, expect.any(String), "company_1", "user_admin", expect.objectContaining({
      business_function_id: "bf_hr",
      department_id: "dept_hr",
    }));

    mocks.repository.findDepartment.mockResolvedValueOnce({ id: "dept_disabled", name: "Disabled", status: "inactive", is_active: 0, archived_at: null, deleted_at: null });
    await expect(service.createFunctionAssignment(env, actor, {
      business_function_id: "bf_hr",
      department_id: "dept_disabled",
    })).rejects.toThrow(/inactive departments cannot be assigned/i);
  });

  it("updates function assignment primary flag and lifecycle status", async () => {
    mocks.repository.findFunctionAssignmentById.mockResolvedValue({ id: "assign_1", company_id: "company_1", business_function_id: "bf_hr", department_id: "dept_hr", assignment_type: "PRIMARY", is_primary: 1, is_active: 1 });

    await service.updateFunctionAssignment(env, actor, "assign_1", { is_primary: false, assignment_type: "SECONDARY" });
    expect(mocks.repository.updateFunctionAssignment).toHaveBeenCalledWith(env, "company_1", "assign_1", "user_admin", expect.objectContaining({ is_primary: false, assignment_type: "SECONDARY" }));

    await service.setFunctionAssignmentStatus(env, actor, "assign_1", false);
    await service.setFunctionAssignmentStatus(env, actor, "assign_1", true);
    await service.setFunctionAssignmentStatus(env, actor, "assign_1", false, true);
    expect(mocks.repository.setFunctionAssignmentStatus).toHaveBeenCalledTimes(3);
  });

  it("requires sensitive manage permission for sensitive operation responsibilities", async () => {
    mocks.permission.hasPermission.mockImplementation((_context, permission) => permission !== "operationOwnership.sensitive.manage");
    mocks.repository.findOperationByCode.mockResolvedValue(operation({ is_sensitive: 1 }));

    await expect(service.createResponsibility(env, actor, validResponsibilityInput({
      operation_code: "PAYROLL_ADJUSTMENT",
      responsibility_type: "FINAL_APPROVER",
      target_type: "DEPARTMENT",
      department_id: "dept_finance",
    }) as never)).rejects.toThrow(/sensitive operation ownership/i);
  });

  it("rejects missing target type", async () => {
    await expect(service.createResponsibility(env, actor, validResponsibilityInput({ target_type: undefined }) as never)).rejects.toThrow(/target type is required/i);
  });

  it("rejects multiple static targets", async () => {
    await expect(service.createResponsibility(env, actor, validResponsibilityInput({
      target_type: "DEPARTMENT",
      business_function_id: "bf_hr",
      department_id: "dept_hr",
    }) as never)).rejects.toThrow(/choose exactly one target model/i);
  });

  it("rejects target types without their required target id", async () => {
    await expect(service.createResponsibility(env, actor, validResponsibilityInput({
      target_type: "BUSINESS_FUNCTION",
      department_id: null,
      business_function_id: null,
    }) as never)).rejects.toThrow(/business function target is required/i);

    await expect(service.createResponsibility(env, actor, validResponsibilityInput({
      target_type: "DEPARTMENT",
      department_id: null,
    }) as never)).rejects.toThrow(/department target is required/i);

    await expect(service.createResponsibility(env, actor, validResponsibilityInput({
      target_type: "SPECIFIC_USER",
      department_id: null,
      user_id: null,
    }) as never)).rejects.toThrow(/specific user target is required/i);
  });

  it("rejects dynamic target types with static target ids", async () => {
    await expect(service.createResponsibility(env, actor, validResponsibilityInput({
      target_type: "REQUESTER_DEPARTMENT",
      department_id: "dept_hr",
    }) as never)).rejects.toThrow(/dynamic and super admin targets cannot include static target ids/i);

    await expect(service.createResponsibility(env, actor, validResponsibilityInput({
      target_type: "SUBJECT_DEPARTMENT",
      department_id: null,
      user_id: "user_specific",
    }) as never)).rejects.toThrow(/dynamic and super admin targets cannot include static target ids/i);
  });

  it("rejects invalid level filters", async () => {
    await expect(service.createResponsibility(env, actor, validResponsibilityInput({ min_level: 0 }) as never)).rejects.toThrow(/minimum level must be between 1 and 4/i);
    await expect(service.createResponsibility(env, actor, validResponsibilityInput({ max_level: 5 }) as never)).rejects.toThrow(/maximum level must be between 1 and 4/i);
    await expect(service.createResponsibility(env, actor, validResponsibilityInput({ min_level: 4, max_level: 2 }) as never)).rejects.toThrow(/minimum level cannot be greater than maximum level/i);
  });

  it("stores canonical required permission and role filters", async () => {
    await service.createResponsibility(env, actor, validResponsibilityInput({
      required_permission: "approvals.hrFinal.approve",
      required_role_id: "role_hr",
      min_level: 3,
      max_level: 4,
    }) as never);

    expect(mocks.repository.createResponsibility).toHaveBeenCalledWith(
      env,
      expect.any(String),
      "company_1",
      "user_admin",
      expect.objectContaining({
        target_type: "DEPARTMENT",
        required_permission: "approvals.hrFinal.approve",
        required_role_id: "role_hr",
        min_level: 3,
        max_level: 4,
      }),
    );
  });
});

describe("operation ownership resolver behavior", () => {
  it("resolves responsibility through business function department assignment", async () => {
    mocks.repository.findActiveResponsibilities.mockResolvedValue([
      responsibility({
        target_type: "BUSINESS_FUNCTION",
        business_function_id: "bf_hr",
        business_function_code: "HR_FUNCTION",
        department_id: null,
        required_permission: "approvals.hrFinal.approve",
        min_level: 3,
        max_level: 4,
      }),
    ]);
    mocks.repository.findPrimaryFunctionAssignment.mockResolvedValue({ department_id: "dept_hr", is_active: 1, department_status: "active" });

    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "LEAVE_REQUEST",
      responsibility_type: "OWNER",
    })).resolves.toMatchObject({
      status: "RESOLVED",
      target_type: "BUSINESS_FUNCTION",
      department_id: "dept_hr",
      resolved_department_id: "dept_hr",
      resolved_business_function_id: "bf_hr",
      resolved_business_function_code: "HR_FUNCTION",
      required_permission: "approvals.hrFinal.approve",
      min_level: 3,
      max_level: 4,
      message: "Responsibility resolved through business function department assignment.",
    });
  });

  it("resolves direct department, specific user, requester department, subject department, and Super Admin targets", async () => {
    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([responsibility({ target_type: "DEPARTMENT", department_id: "dept_ops" })]);
    mocks.repository.findDepartment.mockResolvedValueOnce({ id: "dept_ops", name: "Ops", status: "active", is_active: 1, archived_at: null, deleted_at: null });
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "ROSTER_CHANGE",
      responsibility_type: "OWNER",
    })).resolves.toMatchObject({ target_type: "DEPARTMENT", resolved_department_id: "dept_ops" });

    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([responsibility({ target_type: "SPECIFIC_USER", department_id: null, user_id: "user_specific" })]);
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "ROSTER_CHANGE",
      responsibility_type: "OWNER",
    })).resolves.toMatchObject({ target_type: "SPECIFIC_USER", resolved_user_id: "user_specific" });

    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([responsibility({ target_type: "REQUESTER_DEPARTMENT", department_id: null })]);
    mocks.repository.findEmployeeStructure.mockResolvedValueOnce({ id: "emp_requester", department_id: "dept_requester", position_id: "pos_1", level: 2, deleted_at: null, archived_at: null, employment_status: "active" });
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "ROSTER_CHANGE",
      responsibility_type: "OWNER",
      requester_employee_id: "emp_requester",
    })).resolves.toMatchObject({ target_type: "REQUESTER_DEPARTMENT", resolved_department_id: "dept_requester" });

    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([responsibility({ target_type: "SUBJECT_DEPARTMENT", department_id: null })]);
    mocks.repository.findEmployeeStructure.mockResolvedValueOnce({ id: "emp_subject", department_id: "dept_subject", position_id: "pos_2", level: 1, deleted_at: null, archived_at: null, employment_status: "active" });
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "ROSTER_CHANGE",
      responsibility_type: "OWNER",
      subject_employee_id: "emp_subject",
    })).resolves.toMatchObject({ target_type: "SUBJECT_DEPARTMENT", resolved_department_id: "dept_subject" });

    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([responsibility({ target_type: "SUPER_ADMIN", department_id: null })]);
    mocks.repository.findSuperAdminUser.mockResolvedValueOnce({ id: "user_super" });
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "ROSTER_CHANGE",
      responsibility_type: "ESCALATION",
    })).resolves.toMatchObject({ target_type: "SUPER_ADMIN", resolved_user_id: "user_super" });
  });

  it("does not resolve inactive business function assignments", async () => {
    mocks.repository.findActiveResponsibilities.mockResolvedValue([
      responsibility({
        operation_code: "ROSTER_CHANGE",
        target_type: "BUSINESS_FUNCTION",
        business_function_id: "bf_roster",
        department_id: null,
        fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
      }),
    ]);
    mocks.repository.findPrimaryFunctionAssignment.mockResolvedValue({ department_id: "dept_roster", is_active: 0, department_status: "active" });

    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "ROSTER_CHANGE",
      responsibility_type: "OWNER",
    })).resolves.toMatchObject({
      status: "HOLD_FOR_MANUAL_ASSIGNMENT",
      fallback_applied: "HOLD_FOR_MANUAL_ASSIGNMENT",
      message: "Business function has no active department assignment.",
    });
  });

  it("returns Super Admin fallback or blocked status when configured", async () => {
    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([]);
    mocks.repository.findSuperAdminUser.mockResolvedValueOnce({ id: "user_super" });
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "GENERIC_REQUEST",
      responsibility_type: "ESCALATION",
      fallback_behavior: "FALLBACK_TO_SUPER_ADMIN",
    })).resolves.toMatchObject({
      status: "USE_SUPER_ADMIN",
      target_type: "SUPER_ADMIN",
      user_id: "user_super",
      resolved_user_id: "user_super",
    });

    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([]);
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "GENERIC_REQUEST",
      responsibility_type: "OWNER",
      fallback_behavior: "BLOCK_OPERATION",
    })).resolves.toMatchObject({
      status: "BLOCKED",
      fallback_applied: "BLOCK_OPERATION",
    });
  });

  it("builds setup warnings for unassigned operations and functions", async () => {
    mocks.repository.listUnassignedOperations.mockResolvedValue([
      operation({ operation_code: "PAYROLL_ADJUSTMENT", operation_name: "Payroll Adjustment", is_sensitive: 1 }),
    ]);
    mocks.repository.listFunctionsWithoutAssignments.mockResolvedValue([
      businessFunction({ code: "FINANCE_FUNCTION", name: "Finance Function", is_sensitive: 1 }),
    ]);

    await expect(service.getSetupWarnings(env, actor)).resolves.toMatchObject({
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: "SENSITIVE_OPERATION_UNASSIGNED" }),
        expect.objectContaining({ code: "BUSINESS_FUNCTION_UNASSIGNED" }),
      ]),
    });
  });

  it("builds setup warnings for final approval, stale target, fallback, and approver gaps", async () => {
    mocks.repository.listSensitiveOperationsWithoutFinalApproval.mockResolvedValue([
      operation({ operation_code: "PAYROLL_FINALIZE", operation_name: "Payroll Finalize", is_sensitive: 1 }),
    ]);
    mocks.repository.listFunctionAssignmentsWithInactiveDepartments.mockResolvedValue([
      { business_function_code: "PAYROLL_FUNCTION", business_function_name: "Payroll", department_id: "dept_inactive" },
    ]);
    mocks.repository.listResponsibilitiesWithInactiveDepartments.mockResolvedValue([
      responsibility({ id: "orm_dept", operation_code: "ROSTER_LOCK", department_id: "dept_inactive" }),
    ]);
    mocks.repository.listResponsibilitiesWithDisabledUsers.mockResolvedValue([
      responsibility({ id: "orm_user", operation_code: "SECURITY_SETTINGS_CHANGE", target_type: "SPECIFIC_USER", department_id: null, user_id: "user_disabled" }),
    ]);
    mocks.repository.listResponsibilitiesWithFallbacks.mockResolvedValue([
      responsibility({ id: "orm_super", operation_code: "GENERIC_REQUEST", fallback_behavior: "USE_SUPER_ADMIN" }),
      responsibility({ id: "orm_block", operation_code: "PAYROLL_RUN", fallback_behavior: "BLOCK_OPERATION" }),
    ]);
    mocks.repository.listSensitiveFinalApprovalsWithoutPermission.mockResolvedValue([
      responsibility({ id: "orm_permission", operation_code: "PAYROLL_FINALIZE", responsibility_type: "FINAL_APPROVAL" }),
    ]);
    mocks.repository.listFinalApprovalResponsibilitiesWithoutLevelApprover.mockResolvedValue([
      responsibility({ id: "orm_level", operation_code: "PAYROLL_FINALIZE", responsibility_type: "FINAL_APPROVAL", department_id: "dept_payroll" }),
    ]);

    await expect(service.getSetupWarnings(env, actor)).resolves.toMatchObject({
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: "SENSITIVE_FINAL_APPROVAL_MISSING" }),
        expect.objectContaining({ code: "BUSINESS_FUNCTION_INACTIVE_DEPARTMENT" }),
        expect.objectContaining({ code: "RESPONSIBILITY_INACTIVE_DEPARTMENT" }),
        expect.objectContaining({ code: "RESPONSIBILITY_DISABLED_USER" }),
        expect.objectContaining({ code: "SUPER_ADMIN_FALLBACK_CONFIGURED" }),
        expect.objectContaining({ code: "BLOCK_OPERATION_FALLBACK_CONFIGURED" }),
        expect.objectContaining({ code: "SENSITIVE_FINAL_APPROVAL_PERMISSION_MISSING" }),
        expect.objectContaining({ code: "FINAL_APPROVAL_LEVEL_APPROVER_MISSING" }),
      ]),
    });
  });
});

describe("operation ownership responsibility update target switching", () => {
  it("switches BUSINESS_FUNCTION responsibility to DEPARTMENT and clears old targets", async () => {
    mocks.repository.findResponsibilityById.mockResolvedValueOnce(responsibility({
      target_type: "BUSINESS_FUNCTION",
      business_function_id: "bf_hr",
      department_id: null,
      user_id: null,
    }));

    await service.updateResponsibility(env, actor, "orm_1", {
      target_type: "DEPARTMENT",
      department_id: "dept_ops",
    } as never);

    expect(mocks.repository.updateResponsibility).toHaveBeenCalledWith(env, "company_1", "orm_1", "user_admin", expect.objectContaining({
      target_type: "DEPARTMENT",
      business_function_id: null,
      department_id: "dept_ops",
      user_id: null,
      use_requester_department: false,
      use_subject_department: false,
    }));
  });

  it("switches DEPARTMENT responsibility to BUSINESS_FUNCTION and clears department", async () => {
    await service.updateResponsibility(env, actor, "orm_1", {
      target_type: "BUSINESS_FUNCTION",
      business_function_id: "bf_payroll",
    } as never);

    expect(mocks.repository.updateResponsibility).toHaveBeenCalledWith(env, "company_1", "orm_1", "user_admin", expect.objectContaining({
      target_type: "BUSINESS_FUNCTION",
      business_function_id: "bf_payroll",
      department_id: null,
      user_id: null,
    }));
  });

  it("switches DEPARTMENT responsibility to REQUESTER_DEPARTMENT and clears static targets", async () => {
    await service.updateResponsibility(env, actor, "orm_1", {
      target_type: "REQUESTER_DEPARTMENT",
    } as never);

    expect(mocks.repository.updateResponsibility).toHaveBeenCalledWith(env, "company_1", "orm_1", "user_admin", expect.objectContaining({
      target_type: "REQUESTER_DEPARTMENT",
      business_function_id: null,
      department_id: null,
      user_id: null,
      use_requester_department: true,
      use_subject_department: false,
    }));
  });

  it("switches SPECIFIC_USER responsibility to SUPER_ADMIN and clears user", async () => {
    mocks.repository.findResponsibilityById.mockResolvedValueOnce(responsibility({
      target_type: "SPECIFIC_USER",
      department_id: null,
      user_id: "user_specific",
    }));

    await service.updateResponsibility(env, actor, "orm_1", {
      target_type: "SUPER_ADMIN",
    } as never);

    expect(mocks.repository.updateResponsibility).toHaveBeenCalledWith(env, "company_1", "orm_1", "user_admin", expect.objectContaining({
      target_type: "SUPER_ADMIN",
      business_function_id: null,
      department_id: null,
      user_id: null,
      use_requester_department: false,
      use_subject_department: false,
    }));
  });

  it("allows clearing required permission, role, and level filters", async () => {
    mocks.repository.findResponsibilityById.mockResolvedValueOnce(responsibility({
      required_permission: "approvals.hrFinal.approve",
      permission_key: "approvals.hrFinal.approve",
      required_role_id: "role_hr",
      role_id: "role_hr",
      min_level: 3,
      max_level: 4,
    }));

    await service.updateResponsibility(env, actor, "orm_1", {
      required_permission: null,
      required_role_id: null,
      min_level: null,
      max_level: null,
    } as never);

    expect(mocks.repository.updateResponsibility).toHaveBeenCalledWith(env, "company_1", "orm_1", "user_admin", expect.objectContaining({
      required_permission: null,
      permission_key: null,
      required_role_id: null,
      role_id: null,
      min_level: null,
      max_level: null,
    }));
  });

  it("rejects invalid mixed target updates", async () => {
    await expect(service.updateResponsibility(env, actor, "orm_1", {
      target_type: "DEPARTMENT",
      department_id: "dept_hr",
      user_id: "user_specific",
    } as never)).rejects.toThrow(/choose exactly one target model/i);
  });
});

describe("operation ownership canonical fallback behavior", () => {
  it("USE_SUPER_ADMIN resolves active Super Admin and legacy alias maps to it", async () => {
    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([]);
    mocks.repository.findSuperAdminUser.mockResolvedValueOnce({ id: "user_super" });

    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "GENERIC_REQUEST",
      responsibility_type: "ESCALATION",
      fallback_behavior: "USE_SUPER_ADMIN",
    })).resolves.toMatchObject({ status: "USE_SUPER_ADMIN", fallback_applied: "USE_SUPER_ADMIN", resolved_user_id: "user_super" });

    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([]);
    mocks.repository.findSuperAdminUser.mockResolvedValueOnce({ id: "user_super" });
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "GENERIC_REQUEST",
      responsibility_type: "ESCALATION",
      fallback_behavior: "FALLBACK_TO_SUPER_ADMIN",
    })).resolves.toMatchObject({ status: "USE_SUPER_ADMIN", fallback_applied: "USE_SUPER_ADMIN" });
  });

  it("USE_OWNER resolves owner responsibility for the same operation", async () => {
    mocks.repository.findActiveResponsibilities
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([responsibility({ responsibility_type: "OWNER", target_type: "DEPARTMENT", department_id: "dept_owner" })]);
    mocks.repository.findDepartment.mockResolvedValueOnce({ id: "dept_owner", name: "Owner", status: "active", is_active: 1, archived_at: null, deleted_at: null });

    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "LEAVE_REQUEST",
      responsibility_type: "EXECUTION",
      fallback_behavior: "USE_OWNER",
    })).resolves.toMatchObject({
      status: "USE_OWNER",
      fallback_applied: "USE_OWNER",
      resolved_department_id: "dept_owner",
    });
  });

  it("USE_FINAL_APPROVAL_DEPARTMENT resolves final approval responsibility", async () => {
    mocks.repository.findActiveResponsibilities
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([responsibility({ responsibility_type: "FINAL_APPROVAL", target_type: "DEPARTMENT", department_id: "dept_final" })]);
    mocks.repository.findDepartment.mockResolvedValueOnce({ id: "dept_final", name: "Final", status: "active", is_active: 1, archived_at: null, deleted_at: null });

    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "LEAVE_REQUEST",
      responsibility_type: "REQUEST_REVIEW",
      fallback_behavior: "USE_FINAL_APPROVAL_DEPARTMENT",
    })).resolves.toMatchObject({
      status: "USE_FINAL_APPROVAL_DEPARTMENT",
      fallback_applied: "USE_FINAL_APPROVAL_DEPARTMENT",
      resolved_department_id: "dept_final",
    });
  });

  it("HOLD, BLOCK_OPERATION, SKIP_OPTIONAL_STEP, and legacy aliases map correctly", async () => {
    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([]);
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "GENERIC_REQUEST",
      responsibility_type: "OWNER",
      fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
    })).resolves.toMatchObject({ status: "HOLD_FOR_MANUAL_ASSIGNMENT" });

    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([]);
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "GENERIC_REQUEST",
      responsibility_type: "OWNER",
      fallback_behavior: "BLOCKED",
    })).resolves.toMatchObject({ status: "BLOCKED", fallback_applied: "BLOCK_OPERATION" });

    mocks.repository.findActiveResponsibilities.mockResolvedValueOnce([
      responsibility({ target_type: "DEPARTMENT", department_id: "dept_inactive", fallback_behavior: "SKIP_OPTIONAL_STEP", is_required: 0 }),
    ]);
    mocks.repository.findDepartment.mockResolvedValueOnce({ id: "dept_inactive", name: "Inactive", status: "inactive", is_active: 0, archived_at: null, deleted_at: null });
    await expect(service.resolveOperationResponsibility(env, actor, {
      operation_code: "GENERIC_REQUEST",
      responsibility_type: "OWNER",
    })).resolves.toMatchObject({ status: "SKIPPED", fallback_applied: "SKIP_OPTIONAL_STEP" });
  });
});

describe("operation ownership route and approval integration markers", () => {
  it("adds lifecycle routes for business functions, assignments, operations, and responsibilities", () => {
    const routes = read("src/routes/operation-ownership.routes.ts");
    [
      "/business-functions/:id/disable",
      "/business-functions/:id/enable",
      "/business-functions/:id/archive",
      "/function-assignments/:id/disable",
      "/function-assignments/:id/enable",
      "/function-assignments/:id/archive",
      "/operations/:operationCode/disable",
      "/operations/:operationCode/enable",
      "/operations/:operationCode/archive",
      "/responsibilities/:id/disable",
      "/responsibilities/:id/enable",
      "/responsibilities/:id/archive",
      "/operations/:operationCode/responsibilities",
    ].forEach((route) => expect(routes).toContain(route));
  });

  it("integrates operation final approver with min/max level, role, and permission filters", () => {
    const resolver = read("src/modules/approvals/approval-approver-resolver.service.ts");
    expect(resolver).toContain('return "FINAL_APPROVAL"');
    expect(resolver).toContain("resolution.min_level");
    expect(resolver).toContain("resolution.max_level");
    expect(resolver).toContain("resolution.required_permission");
    expect(resolver).toContain("resolution.required_role_id");
    expect(resolver).toContain("HR_FINAL_APPROVER");
    expect(resolver).toContain("FINANCE_FINAL_APPROVER");
  });

  it("keeps operation ownership protected from normal employee access", () => {
    const routes = read("src/routes/operation-ownership.routes.ts");
    expect(routes).toContain("viewGuard");
    expect(routes).toContain("manageGuard");
    expect(routes).toContain("operationOwnership.view");
    expect(routes).toContain("operationOwnership.manage");
  });
});

describe("operation ownership frontend setup UI", () => {
  it("adds split setup tables and dialogs", () => {
    [
      "frontend/src/features/operation-ownership/BusinessFunctionsTable.tsx",
      "frontend/src/features/operation-ownership/BusinessFunctionDialog.tsx",
      "frontend/src/features/operation-ownership/FunctionAssignmentsTable.tsx",
      "frontend/src/features/operation-ownership/FunctionAssignmentDialog.tsx",
      "frontend/src/features/operation-ownership/OperationCatalogTable.tsx",
      "frontend/src/features/operation-ownership/OperationMatrixTable.tsx",
      "frontend/src/features/operation-ownership/SetupWarningsPanel.tsx",
      "frontend/src/features/operation-ownership/OperationResponsibilityDialog.tsx",
      "frontend/src/features/operation-ownership/OperationResolveDialog.tsx",
    ].forEach((path) => expect(read(path).length).toBeGreaterThan(100));
  });

  it("shows target type, level, permission, role, and selector-based targets in the responsibility dialog", () => {
    const dialog = read("frontend/src/features/operation-ownership/OperationResponsibilityDialog.tsx");
    expect(dialog).toContain("Target type");
    expect(dialog).toContain("Min level");
    expect(dialog).toContain("Max level");
    expect(dialog).toContain("Required permission");
    expect(dialog).toContain("Required role");
    expect(dialog).toContain("USE_SUPER_ADMIN");
    expect(dialog).toContain("USE_OWNER");
    expect(dialog).toContain("USE_FINAL_APPROVAL_DEPARTMENT");
    expect(dialog).toContain("SKIP_OPTIONAL_STEP");
    expect(dialog).toContain("Business function");
    expect(dialog).toContain("Department");
    expect(dialog).toContain("Specific user");
    expect(dialog).not.toContain("Department ID");
    expect(dialog).not.toMatch(/window\.alert\(|window\.confirm\(|\balert\(|\bconfirm\(/);
  });

  it("adds business function and function assignment management dialogs", () => {
    const businessDialog = read("frontend/src/features/operation-ownership/BusinessFunctionDialog.tsx");
    const assignmentDialog = read("frontend/src/features/operation-ownership/FunctionAssignmentDialog.tsx");
    const functionsTable = read("frontend/src/features/operation-ownership/BusinessFunctionsTable.tsx");
    const assignmentsTable = read("frontend/src/features/operation-ownership/FunctionAssignmentsTable.tsx");

    expect(businessDialog).toContain("Create Business Function");
    expect(businessDialog).toContain("sensitive");
    expect(assignmentDialog).toContain("Business function selector");
    expect(assignmentDialog).toContain("Department selector");
    expect(assignmentDialog).not.toContain("Department ID");
    expect(functionsTable).toContain("RowActions");
    expect(assignmentsTable).toContain("RowActions");
  });

  it("renders operation ownership page tabs and keeps navigation permission-gated", () => {
    const page = read("frontend/src/features/operation-ownership/OperationOwnershipPage.tsx");
    expect(page).toContain("Business Functions");
    expect(page).toContain("Function Assignments");
    expect(page).toContain("Operation Matrix");
    expect(page).toContain("Setup Warnings");
    expect(read("frontend/src/lib/navigation.ts")).toContain("Operation Ownership");
    expect(read("frontend/src/lib/navigation.ts")).toContain("operationOwnership.matrix.view");
  });
});
