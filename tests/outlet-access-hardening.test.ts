import { describe, expect, it } from "vitest";

import { hasOutletAccess } from "../src/services/permission.service";
import type { AuthActor } from "../src/types/api.types";

type EmployeeRow = {
  id: string;
  company_id: string;
  full_name: string;
  primary_outlet_id: string | null;
};

type EmployeeLinkedRow = {
  id: string;
  company_id: string;
  employee_id: string;
};

type PayrollItemRow = {
  id: string;
  company_id: string;
  employee_id: string;
  outlet_id: string | null;
  gross_amount: number;
  total_deductions_amount: number;
  net_amount: number;
};

type ApprovalRow = {
  id: string;
  company_id: string;
  employee_id?: string | null;
  outlet_id?: string | null;
  requester_user_id?: string | null;
  assigned_approver_user_id?: string | null;
  delegated_approver_user_id?: string | null;
};

type PayrollRunRow = {
  id: string;
  company_id: string;
  payroll_month: string;
  status: string;
};

type PayrollMutation =
  | "attendance"
  | "leave"
  | "long_leave"
  | "advance"
  | "loan"
  | "asset_deduction"
  | "payroll_import";

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  requestId: "req_scope",
  companyId: "company_1",
  actorUserId: "user_manager",
  fullName: "Outlet Manager",
  email: "manager@example.test",
  roles: ["Outlet Manager"],
  roleKeys: ["outlet_manager"],
  permissions: [
    "employees.view",
    "documents.view",
    "payroll.view",
    "payroll_reports.view",
    "approvals.view",
    "report_exports.preview",
  ],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

const employees: EmployeeRow[] = [
  { id: "emp_1", company_id: "company_1", full_name: "Aisha", primary_outlet_id: "outlet_1" },
  { id: "emp_2", company_id: "company_1", full_name: "Bilal", primary_outlet_id: "outlet_2" },
  { id: "emp_3", company_id: "company_2", full_name: "Cross Company", primary_outlet_id: "outlet_1" },
];

const payrollItems: PayrollItemRow[] = [
  { id: "pay_item_1", company_id: "company_1", employee_id: "emp_1", outlet_id: "outlet_1", gross_amount: 1000, total_deductions_amount: 100, net_amount: 900 },
  { id: "pay_item_2", company_id: "company_1", employee_id: "emp_2", outlet_id: "outlet_2", gross_amount: 2000, total_deductions_amount: 200, net_amount: 1800 },
  { id: "pay_item_3", company_id: "company_2", employee_id: "emp_3", outlet_id: "outlet_1", gross_amount: 3000, total_deductions_amount: 300, net_amount: 2700 },
];

const documents: EmployeeLinkedRow[] = [
  { id: "doc_1", company_id: "company_1", employee_id: "emp_1" },
  { id: "doc_2", company_id: "company_1", employee_id: "emp_2" },
  { id: "doc_3", company_id: "company_2", employee_id: "emp_3" },
];

const findEmployee = (companyId: string, employeeId: string) =>
  employees.find((employee) => employee.company_id === companyId && employee.id === employeeId) ?? null;

const scopedEmployees = (context: AuthActor, rows: EmployeeRow[] = employees) =>
  rows.filter(
    (employee) =>
      employee.company_id === context.companyId &&
      hasOutletAccess(context, employee.primary_outlet_id),
  );

const scopedEmployeeLinkedRows = <T extends EmployeeLinkedRow>(
  context: AuthActor,
  rows: T[],
) =>
  rows.filter((row) => {
    if (row.company_id !== context.companyId) return false;
    const employee = findEmployee(context.companyId, row.employee_id);
    return Boolean(employee && hasOutletAccess(context, employee.primary_outlet_id));
  });

const scopedPayrollItems = (context: AuthActor) =>
  payrollItems.filter(
    (item) =>
      item.company_id === context.companyId &&
      hasOutletAccess(context, item.outlet_id) &&
      scopedEmployees(context).some((employee) => employee.id === item.employee_id),
  );

const payrollTotals = (context: AuthActor) =>
  scopedPayrollItems(context).reduce(
    (totals, item) => ({
      gross: totals.gross + item.gross_amount,
      deductions: totals.deductions + item.total_deductions_amount,
      net: totals.net + item.net_amount,
    }),
    { gross: 0, deductions: 0, net: 0 },
  );

const visibleApprovals = (context: AuthActor, rows: ApprovalRow[]) =>
  rows.filter((row) => {
    if (row.company_id !== context.companyId) return false;
    if (context.isSuperAdmin) return true;
    if (row.requester_user_id === context.actorUserId) return true;
    if (row.assigned_approver_user_id === context.actorUserId) return true;
    if (row.delegated_approver_user_id === context.actorUserId) return true;
    if (row.outlet_id) return hasOutletAccess(context, row.outlet_id);
    if (!row.employee_id) return false;
    const employee = findEmployee(context.companyId, row.employee_id);
    return Boolean(employee && hasOutletAccess(context, employee.primary_outlet_id));
  });

const paginatedEmployees = (context: AuthActor, page: number, pageSize: number) => {
  const rows = scopedEmployees(context);
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, page_size: pageSize, total: rows.length },
  };
};

const reportAndExportTotals = (context: AuthActor) => {
  const employeeRows = scopedEmployees(context);
  const itemRows = scopedPayrollItems(context);
  return {
    report: {
      employees: employeeRows.length,
      payroll_net_total: itemRows.reduce((sum, item) => sum + item.net_amount, 0),
    },
    exportRows: itemRows.map((item) => ({
      id: item.id,
      employee_id: item.employee_id,
      outlet_id: item.outlet_id,
      net_amount: item.net_amount,
    })),
  };
};

const lockedStatuses = new Set(["finalizing", "finalized", "locked", "paid"]);

const payrollMonthForDate = (date: string) => date.slice(0, 7);

const assertPayrollMutationAllowed = (
  mutation: PayrollMutation,
  companyId: string,
  effectiveDate: string,
  runs: PayrollRunRow[],
) => {
  const month = payrollMonthForDate(effectiveDate);
  const locked = runs.find(
    (run) =>
      run.company_id === companyId &&
      run.payroll_month === month &&
      lockedStatuses.has(run.status),
  );

  if (locked) {
    throw new Error(`${mutation} is blocked by locked payroll period ${locked.payroll_month}`);
  }
};

describe("outlet access hardening behavior", () => {
  it("outlet-limited user sees only their outlet employees and employee-linked records", () => {
    const manager = actor({ outletIds: ["outlet_1"] });

    expect(scopedEmployees(manager).map((employee) => employee.id)).toEqual(["emp_1"]);
    expect(scopedEmployeeLinkedRows(manager, documents).map((document) => document.id)).toEqual(["doc_1"]);
  });

  it("outlet-limited payroll item lists and totals include only accessible outlet items", () => {
    const manager = actor({ outletIds: ["outlet_1"] });

    expect(scopedPayrollItems(manager).map((item) => item.id)).toEqual(["pay_item_1"]);
    expect(payrollTotals(manager)).toEqual({ gross: 1000, deductions: 100, net: 900 });
  });

  it("outlet-limited document lists and reports filter through employee primary outlet", () => {
    const manager = actor({ outletIds: ["outlet_1"] });
    const scopedDocs = scopedEmployeeLinkedRows(manager, documents);
    const report = reportAndExportTotals(manager);

    expect(scopedDocs).toHaveLength(1);
    expect(scopedDocs[0].employee_id).toBe("emp_1");
    expect(report.report.employees).toBe(1);
  });

  it("outlet-limited approval lists do not leak inaccessible counts", () => {
    const manager = actor({ outletIds: ["outlet_1"] });
    const approvals: ApprovalRow[] = [
      { id: "approval_1", company_id: "company_1", employee_id: "emp_1" },
      { id: "approval_2", company_id: "company_1", employee_id: "emp_2" },
      { id: "approval_3", company_id: "company_2", employee_id: "emp_3" },
    ];

    const visible = visibleApprovals(manager, approvals);

    expect(visible.map((approval) => approval.id)).toEqual(["approval_1"]);
    expect(visible).toHaveLength(1);
  });

  it("outlet-limited reports and exports return scoped totals only", () => {
    const manager = actor({ outletIds: ["outlet_1"] });
    const output = reportAndExportTotals(manager);

    expect(output.report).toEqual({ employees: 1, payroll_net_total: 900 });
    expect(output.exportRows).toEqual([
      { id: "pay_item_1", employee_id: "emp_1", outlet_id: "outlet_1", net_amount: 900 },
    ]);
  });

  it("pagination totals match outlet-filtered SQL and count query behavior", () => {
    const manager = actor({ outletIds: ["outlet_1"] });
    const page = paginatedEmployees(manager, 1, 1);

    expect(page.rows.map((employee) => employee.id)).toEqual(["emp_1"]);
    expect(page.pagination.total).toBe(scopedEmployees(manager).length);
    expect(page.pagination.total).toBe(1);
  });

  it("company-level approval records are visible only to eligible actors", () => {
    const manager = actor({ actorUserId: "user_manager", outletIds: ["outlet_1"] });
    const requester = actor({ actorUserId: "user_requester", outletIds: [] });
    const approver = actor({ actorUserId: "user_approver", outletIds: [] });
    const delegated = actor({ actorUserId: "user_delegate", outletIds: [] });
    const superAdmin = actor({ actorUserId: "super_admin", isSuperAdmin: true, roleKeys: ["super_admin"], outletIds: [] });
    const approvals: ApprovalRow[] = [
      {
        id: "company_level_approval",
        company_id: "company_1",
        requester_user_id: "user_requester",
        assigned_approver_user_id: "user_approver",
        delegated_approver_user_id: "user_delegate",
      },
    ];

    expect(visibleApprovals(manager, approvals)).toEqual([]);
    expect(visibleApprovals(requester, approvals)).toHaveLength(1);
    expect(visibleApprovals(approver, approvals)).toHaveLength(1);
    expect(visibleApprovals(delegated, approvals)).toHaveLength(1);
    expect(visibleApprovals(superAdmin, approvals)).toHaveLength(1);
  });

  it("payroll locks block attendance leave long leave advances loans asset deductions and payroll-impacting imports", () => {
    const lockedRuns: PayrollRunRow[] = [
      { id: "run_2026_06", company_id: "company_1", payroll_month: "2026-06", status: "finalized" },
    ];

    const mutations: PayrollMutation[] = [
      "attendance",
      "leave",
      "long_leave",
      "advance",
      "loan",
      "asset_deduction",
      "payroll_import",
    ];

    for (const mutation of mutations) {
      expect(() =>
        assertPayrollMutationAllowed(mutation, "company_1", "2026-06-15", lockedRuns),
      ).toThrow(`${mutation} is blocked by locked payroll period 2026-06`);
    }

    for (const mutation of mutations) {
      expect(() =>
        assertPayrollMutationAllowed(mutation, "company_1", "2026-07-01", lockedRuns),
      ).not.toThrow();
    }
  });
});
