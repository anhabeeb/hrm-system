import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const fileExists = (path: string) => {
  try {
    readFileSync(resolve(root, path), "utf8");
    return true;
  } catch {
    return false;
  }
};

const pages = [
  ["Employees", "frontend/src/features/employees/EmployeesPage.tsx", ["EmployeeList"]],
  ["Attendance", "frontend/src/features/attendance/AttendancePage.tsx", ["AttendanceSummaryTable", "EmployeeAttendanceCalendarWidget"]],
  ["Leave", "frontend/src/features/leave/LeavePage.tsx", ["LeaveRequestsTable", "LeaveBalancesTable"]],
  ["Roster", "frontend/src/features/rosters/RostersPage.tsx", ["DataTable", "RosterWeeklyMatrixPage"]],
  ["Payroll", "frontend/src/features/payroll/PayrollPage.tsx", ["PayrollRunsTable", "PayrollAdjustmentsTable"]],
  ["Documents/KYC", "frontend/src/features/documents/DocumentsPage.tsx", ["DocumentsTable", "DocumentKycRequestsTable"]],
  ["Approvals", "frontend/src/features/approvals/ApprovalsPage.tsx", ["ApprovalInboxTable", "ApprovalEngineRequestsTable"]],
  ["Operation Ownership", "frontend/src/features/operation-ownership/OperationOwnershipPage.tsx", ["OperationMatrixTable", "SetupWarningsPanel"]],
  ["Offboarding", "frontend/src/features/offboarding/OffboardingPage.tsx", ["<Table", "EmployeeExitDetailDrawer"]],
  ["Disciplinary", "frontend/src/features/discipline/DisciplinaryActionsPage.tsx", ["DisciplinaryActionsTable"]],
] as const;

describe("Module Landing Page Modernization", () => {
  it("shared ModuleLanding components exist", () => {
    for (const file of [
      "ModuleLandingHeader.tsx",
      "ModuleLandingShell.tsx",
      "ModuleSummaryGrid.tsx",
      "ModuleSummaryTile.tsx",
      "ModuleAttentionPanel.tsx",
      "ModuleQuickActions.tsx",
      "ModuleSetupNotice.tsx",
      "ModuleStatusStrip.tsx",
      "ModuleTableSection.tsx",
      "ModuleEmptyState.tsx",
      "ModuleFilterSummary.tsx",
      "index.ts",
    ]) {
      expect(fileExists(`frontend/src/components/module-landing/${file}`)).toBe(true);
    }
  });

  it("each required module landing page uses shared overview components", () => {
    for (const [label, path] of pages) {
      const text = read(path);
      expect(text, label).toContain("ModuleLandingHeader");
      expect(text, label).toContain("ModuleSummaryGrid");
      expect(text, label).toContain("ModuleSummaryTile");
      expect(text, label).toContain("ModuleAttentionPanel");
    }
  });

  it("existing table workflows remain", () => {
    for (const [label, path, tokens] of pages) {
      const text = read(path);
      for (const token of tokens) expect(text, `${label} should preserve ${token}`).toContain(token);
    }
  });

  it("quick actions remain permission or module aware", () => {
    for (const [label, path] of pages) {
      const text = read(path);
      expect(text, label).toMatch(/ModuleQuickActions|actions=\{\(/);
      expect(text, label).toMatch(/has\(|auth\.has|can[A-Z]|hasAnyPermission|hasPermission/);
    }
  });

  it("no fake placeholder metrics are used for key module landing counts", () => {
    const combined = pages.map(([, path]) => read(path)).join("\n");
    expect(combined).not.toMatch(/pending_count:\s*0|employees_without_login:\s*0|pending_kyc_updates:\s*0|pending_reviews:\s*0|operations_missing_owner:\s*0/);
    expect(combined).toContain("Not configured");
    expect(combined).toContain("—");
  });

  it("permission-specific quick action guards are present", () => {
    expect(read("frontend/src/features/employees/EmployeesPage.tsx")).toEqual(expect.stringContaining("canUseEmployeeLoginModule"));
    expect(read("frontend/src/features/employees/EmployeesPage.tsx")).toEqual(expect.stringContaining("canViewStructureChanges"));
    expect(read("frontend/src/features/attendance/AttendancePage.tsx")).toEqual(expect.stringContaining("canViewReports"));
    expect(read("frontend/src/features/attendance/AttendancePage.tsx")).toEqual(expect.stringContaining("canViewCorrections"));
    expect(read("frontend/src/features/leave/LeavePage.tsx")).toEqual(expect.stringContaining("canViewApprovalInbox"));
    expect(read("frontend/src/features/leave/LeavePage.tsx")).toEqual(expect.stringContaining("canViewBalances"));
    expect(read("frontend/src/features/leave/LeavePage.tsx")).toEqual(expect.stringContaining("canViewLeaveCalendar"));
    expect(read("frontend/src/features/rosters/RostersPage.tsx")).toEqual(expect.stringContaining("canViewWeeklyMatrix"));
    expect(read("frontend/src/features/rosters/RostersPage.tsx")).toEqual(expect.stringContaining("canBulkRoster"));
    expect(read("frontend/src/features/payroll/PayrollPage.tsx")).toEqual(expect.stringContaining("canViewAttendanceReview"));
    expect(read("frontend/src/features/payroll/PayrollPage.tsx")).toEqual(expect.stringContaining("canUsePayrollAdjustments"));
  });

  it("cross-module attention messages require permission as well as module state", () => {
    expect(read("frontend/src/features/employees/EmployeesPage.tsx")).toContain("canViewDocumentKycAttention");
    expect(read("frontend/src/features/leave/LeavePage.tsx")).toContain("canViewRosterConflictReview");
    expect(read("frontend/src/features/rosters/RostersPage.tsx")).toContain("canViewLeaveConflictOverlay");
    expect(read("frontend/src/features/payroll/PayrollPage.tsx")).toContain("canViewAttendanceReview");
  });

  it("Attendance Present today does not fall back to loaded range rows", () => {
    const attendance = read("frontend/src/features/attendance/AttendancePage.tsx");
    expect(attendance).toContain("todayStatusCount");
    expect(attendance).toContain('label="Present today"');
    expect(attendance).not.toMatch(/todayRows\.length\s*\?\s*todayRows[\s\S]{0,160}:\s*statusCount/);
  });

  it("Employees Active employees is not pagination total", () => {
    const employees = read("frontend/src/features/employees/EmployeesPage.tsx");
    expect(employees).toContain("activeEmployees = employeeRows.filter");
    expect(employees).toContain('label="Active employees" value={activeEmployees}');
    expect(employees).not.toContain('label="Active employees" value={totalEmployees}');
  });

  it("Open tab and Select run are not used as primary metric values", () => {
    const combined = pages.map(([, path]) => read(path)).join("\n");
    expect(combined).not.toMatch(/value=\{[^}]*["'`](Open tab|Select run|Restricted|Open queue|Open inbox)["'`]/);
  });

  it("no browser alert confirm or dark mode is introduced", () => {
    const combined = pages.map(([, path]) => read(path)).join("\n");
    expect(combined).not.toMatch(/alert\s*\(/);
    expect(combined).not.toMatch(/confirm\s*\(/);
    expect(combined).not.toMatch(/dark:|darkMode|ThemeProvider/);
  });
});
