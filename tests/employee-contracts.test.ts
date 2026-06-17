import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true })),
}));

import * as repository from "../src/modules/employee-contracts/employee-contracts.repository";
import * as settingsService from "../src/services/settings.service";
import {
  archiveContract,
  createContract,
  listEmployeeContracts,
  renewContract,
} from "../src/modules/employee-contracts/employee-contracts.service";
import type { AuthActor } from "../src/types/api.types";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const context: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_hr",
  fullName: "HR Admin",
  email: "hr@example.test",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions: [
    "employees.view",
    "employees.contracts.view",
    "employees.contracts.manage",
    "contracts.view",
    "contracts.manage",
  ],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const employee = {
  id: "emp_1",
  company_id: "company_1",
  employee_code: "EMP001",
  full_name: "Aisha Mohamed",
  employee_type: "foreign",
  primary_outlet_id: "outlet_1",
  department_id: "dept_1",
  position_id: "pos_1",
  deleted_at: null,
};

const contract = {
  id: "contract_1",
  company_id: "company_1",
  employee_id: "emp_1",
  contract_number: "CON-2026-001",
  contract_type: "fixed_term",
  contract_status: "active",
  start_date: "2026-07-01",
  end_date: "2027-06-30",
  signed_date: "2026-06-25",
  probation_end_date: null,
  renewal_of_contract_id: null,
  version_number: 1,
  document_id: "doc_1",
  salary_snapshot_amount: 900000,
  currency: "MVR",
  position_id: "pos_1",
  department_id: "dept_1",
  outlet_id: "outlet_1",
  notes: null,
  reason: "Initial contract",
  created_by: "user_hr",
  created_at: "2026-06-25T00:00:00.000Z",
  updated_by: "user_hr",
  updated_at: "2026-06-25T00:00:00.000Z",
  archived_at: null,
  archived_by: null,
  document: { id: "doc_1", document_type: "employment_contract", file_name: "contract.pdf", expiry_date: null, status: "active" },
};

afterEach(() => {
  vi.restoreAllMocks();
});

const stubBase = () => {
  vi.spyOn(settingsService, "getSetting").mockResolvedValue({
    setting_value_json: JSON.stringify({
      contract_tracking_enabled: true,
      contract_expiry_warning_days: 60,
      contract_document_required: false,
      allow_multiple_active_contracts: false,
    }),
  } as any);
  vi.spyOn(repository, "findEmployee").mockResolvedValue(employee as any);
  vi.spyOn(repository, "findDocumentForEmployee").mockResolvedValue({ id: "doc_1", company_id: "company_1", employee_id: "emp_1", document_type: "employment_contract", file_name: "contract.pdf" });
  vi.spyOn(repository, "findDuplicateContractNumber").mockResolvedValue(null);
  vi.spyOn(repository, "findOverlappingContract").mockResolvedValue(null);
  vi.spyOn(repository, "findContractById").mockResolvedValue(contract as any);
};

describe("employee contract schema and routes", () => {
  it("schema migration creates employee_contracts table and indexes", () => {
    const migration = read("migrations/0032_employee_contracts.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS employee_contracts");
    expect(migration).toContain("renewal_of_contract_id");
    expect(migration).toContain("version_number");
    expect(migration).toContain("idx_employee_contracts_company_employee_start");
    expect(migration).toContain("documents.contract_rules");
  });

  it("registers employee-scoped and global contract routes", () => {
    const employeeRoutes = read("src/routes/employees.routes.ts");
    const contractRoutes = read("src/routes/contracts.routes.ts");

    expect(employeeRoutes).toContain("/:id/contracts");
    expect(employeeRoutes).toContain("/:id/contracts/:contractId/renew");
    expect(employeeRoutes).toContain('requireFeature("contract_tracking")');
    expect(contractRoutes).toContain('requireFeature("employee_management")');
    expect(contractRoutes).toContain('requireFeature("contract_tracking")');
    expect(read("src/app.ts")).toContain('apiV1.route("/contracts", contractsRoutes)');
  });

  it("frontend exposes employee profile contracts and global contracts page", () => {
    expect(read("frontend/src/features/employees/EmployeeDetailDrawer.tsx")).toContain("EmployeeContractsPanel");
    expect(read("frontend/src/app/router.tsx")).toContain('path="/contracts"');
    expect(read("frontend/src/lib/navigation.ts")).toContain("Contracts");
  });

  it("contract form uses document selector instead of raw document id input", () => {
    const form = read("frontend/src/features/contracts/ContractFormDialog.tsx");
    const selector = read("frontend/src/features/contracts/EmployeeDocumentCombobox.tsx");

    expect(form).toContain("Contract document");
    expect(form).toContain("EmployeeDocumentCombobox");
    expect(form).not.toContain("Document ID");
    expect(selector).toContain("documentTypeLabel");
    expect(selector).toContain("file_name");
    expect(form).toContain("document_id");
  });

  it("global contract filters use shared selectors instead of raw id inputs", () => {
    const page = read("frontend/src/features/contracts/ContractsPage.tsx");

    expect(page).toContain("EmployeeCombobox");
    expect(page).toContain("OutletCombobox");
    expect(page).toContain("DepartmentCombobox");
    expect(page).toContain("PositionCombobox");
    expect(page).not.toContain("Outlet ID");
    expect(page).not.toContain("Department ID");
    expect(page).not.toContain("Position ID");
    expect(page).not.toContain("Employee ID");
  });

  it("contract tables expose secure document action without storage keys", () => {
    const action = read("frontend/src/features/contracts/ContractDocumentAction.tsx");
    const panel = read("frontend/src/features/contracts/EmployeeContractsPanel.tsx");
    const page = read("frontend/src/features/contracts/ContractsPage.tsx");

    expect(action).toContain("documentsApi.download");
    expect(action).toContain('auth.hasFeature("documents")');
    expect(action).toContain("Document download is available from Employee Documents.");
    expect(action).toContain("linked document download requires Document Tracking");
    expect(panel).toContain("ContractDocumentAction");
    expect(page).toContain("ContractDocumentAction");
    expect(action).not.toMatch(/file_key|storage_key|r2_key|signedUrl|signed_url/);
    expect(panel).not.toMatch(/file_key|storage_key|r2_key|signedUrl|signed_url/);
    expect(page).not.toMatch(/file_key|storage_key|r2_key|signedUrl|signed_url/);
  });
});

describe("employee contract service behavior", () => {
  it("creates first contract", async () => {
    stubBase();
    const create = vi.spyOn(repository, "createContract").mockResolvedValue({ success: true } as any);

    const result = await createContract({} as Env, context, "emp_1", {
      contract_number: "CON-2026-001",
      contract_type: "fixed_term",
      start_date: "2026-07-01",
      end_date: "2027-06-30",
      signed_date: "2026-06-25",
      document_id: "doc_1",
      reason: "Initial employment contract",
    });

    expect(create).toHaveBeenCalled();
    expect(result.contract?.id).toBe("contract_1");
  });

  it("fixed-term contract requires end date", async () => {
    stubBase();
    const create = vi.spyOn(repository, "createContract");

    await expect(createContract({} as Env, context, "emp_1", {
      contract_type: "fixed_term",
      start_date: "2026-07-01",
      reason: "Missing end date",
    })).rejects.toMatchObject({ code: "CONTRACT_END_DATE_REQUIRED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("permanent contract may omit end date", async () => {
    stubBase();
    const create = vi.spyOn(repository, "createContract").mockResolvedValue({ success: true } as any);

    await createContract({} as Env, context, "emp_1", {
      contract_type: "permanent",
      start_date: "2026-07-01",
      reason: "Permanent employment",
    });

    expect(create).toHaveBeenCalled();
  });

  it("end date before start date is rejected", async () => {
    stubBase();
    await expect(createContract({} as Env, context, "emp_1", {
      contract_type: "fixed_term",
      start_date: "2026-07-01",
      end_date: "2026-06-30",
      reason: "Bad date range",
    })).rejects.toMatchObject({ code: "CONTRACT_DATE_RANGE_INVALID" });
  });

  it("signed date after start date is rejected", async () => {
    stubBase();
    await expect(createContract({} as Env, context, "emp_1", {
      contract_type: "fixed_term",
      start_date: "2026-07-01",
      end_date: "2027-06-30",
      signed_date: "2026-07-02",
      reason: "Late signing date",
    })).rejects.toMatchObject({
      code: "CONTRACT_DATE_RANGE_INVALID",
      fieldErrors: { signed_date: "Contract signed date cannot be after the start date." },
    });
  });

  it("duplicate contract number is rejected", async () => {
    stubBase();
    vi.spyOn(repository, "findDuplicateContractNumber").mockResolvedValue({ id: "contract_other" });
    await expect(createContract({} as Env, context, "emp_1", {
      contract_number: "CON-2026-001",
      contract_type: "fixed_term",
      start_date: "2026-07-01",
      end_date: "2027-06-30",
      reason: "Duplicate",
    })).rejects.toMatchObject({ code: "DUPLICATE_CONTRACT_NUMBER" });
  });

  it("overlapping active contract is rejected", async () => {
    stubBase();
    vi.spyOn(repository, "findOverlappingContract").mockResolvedValue({ id: "contract_existing" });
    await expect(createContract({} as Env, context, "emp_1", {
      contract_type: "fixed_term",
      start_date: "2026-08-01",
      end_date: "2027-07-31",
      reason: "Overlap",
    })).rejects.toMatchObject({ code: "CONTRACT_OVERLAP" });
  });

  it("contract document must belong to employee/company", async () => {
    stubBase();
    vi.spyOn(repository, "findDocumentForEmployee").mockResolvedValue(null);
    await expect(createContract({} as Env, context, "emp_1", {
      contract_type: "fixed_term",
      start_date: "2026-07-01",
      end_date: "2027-06-30",
      document_id: "doc_other",
      reason: "Wrong document",
    })).rejects.toMatchObject({ code: "CONTRACT_DOCUMENT_INVALID" });
  });

  it("renew contract creates new version and links old contract", async () => {
    stubBase();
    const renew = vi.spyOn(repository, "markRenewedAndCreate").mockResolvedValue([] as any);
    await renewContract({} as Env, context, "emp_1", "contract_1", {
      new_contract_number: "CON-2027-001",
      start_date: "2027-07-01",
      end_date: "2028-06-30",
      signed_date: "2027-06-20",
      document_id: "doc_1",
      reason: "Annual renewal",
    });
    expect(renew).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      oldContractId: "contract_1",
      employeeId: "emp_1",
      payload: expect.objectContaining({ version_number: 2, renewal_of_contract_id: "contract_1" }),
    }));
  });

  it("archive contract preserves history by updating status only", async () => {
    stubBase();
    const archive = vi.spyOn(repository, "archiveContract").mockResolvedValue({ success: true } as any);
    await archiveContract({} as Env, context, "emp_1", "contract_1", { reason: "Superseded" });
    expect(archive).toHaveBeenCalledWith(expect.anything(), "company_1", "contract_1", "user_hr", "Superseded", undefined);
  });

  it("expiring and missing document warnings are returned for employee profile", async () => {
    stubBase();
    vi.spyOn(repository, "listContractsForEmployee").mockResolvedValue([
      { ...contract, contract_status: "expiring_soon", document_id: null, document: null, days_until_expiry: 20 } as any,
    ]);
    const result = await listEmployeeContracts({} as Env, context, "emp_1");
    expect(result.current_contract?.contract_status).toBe("expiring_soon");
    expect(result.warnings).toContain("Contract expires in 20 days.");
  });

  it("expired latest contract warning is specific and keeps expired contract visible", async () => {
    stubBase();
    vi.spyOn(repository, "listContractsForEmployee").mockResolvedValue([
      { ...contract, contract_status: "expired", end_date: "2026-06-30", days_until_expiry: -1 } as any,
    ]);
    const result = await listEmployeeContracts({} as Env, context, "emp_1");
    expect(result.current_contract?.contract_status).toBe("expired");
    expect(result.warnings).toContain("No active contract. Latest contract expired on 2026-06-30.");
  });

  it("no contracts warning is distinct from expired contract warning", async () => {
    stubBase();
    vi.spyOn(repository, "listContractsForEmployee").mockResolvedValue([]);
    const result = await listEmployeeContracts({} as Env, context, "emp_1");
    expect(result.current_contract).toBeNull();
    expect(result.warnings).toContain("No contract is recorded for this employee.");
  });

  it("raw document file keys are not selected or exposed", () => {
    expect(read("src/modules/employee-contracts/employee-contracts.repository.ts")).not.toContain("doc.file_key");
    expect(JSON.stringify(contract)).not.toContain("file_key");
  });

  it("unauthorized user is denied", async () => {
    stubBase();
    const limited = { ...context, permissions: [], isSuperAdmin: false, isAdmin: false };
    await expect(listEmployeeContracts({} as Env, limited, "emp_1")).rejects.toMatchObject({ code: "CONTRACT_PERMISSION_DENIED" });
  });

  it("cross-outlet access is denied", async () => {
    stubBase();
    vi.spyOn(repository, "findEmployee").mockResolvedValue({ ...employee, primary_outlet_id: "outlet_other" } as any);
    await expect(listEmployeeContracts({} as Env, context, "emp_1")).rejects.toMatchObject({ code: "OUTLET_ACCESS_DENIED" });
  });

  it("Super Admin is allowed inside company", async () => {
    stubBase();
    vi.spyOn(repository, "listContractsForEmployee").mockResolvedValue([]);
    const superAdmin = { ...context, permissions: [], outletIds: [], isSuperAdmin: true, isAdmin: true };
    await expect(listEmployeeContracts({} as Env, superAdmin, "emp_1")).resolves.toMatchObject({ contracts: [] });
  });
});
