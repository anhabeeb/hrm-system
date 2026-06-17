import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import * as controller from "../modules/payroll-reports/payroll-reports.controller";
import type { AppContext } from "../types/api.types";

const payrollReportsRoutes = new Hono<AppContext>();

payrollReportsRoutes.use("*", authMiddleware);
payrollReportsRoutes.use("*", requireFeature("reports"));
payrollReportsRoutes.get("/catalog", requirePermission("payroll_reports.catalog.view"), controller.catalog);

payrollReportsRoutes.use("*", requirePermission("payroll_reports.view"));

payrollReportsRoutes.get("/summary", controller.summary);
payrollReportsRoutes.get("/monthly-summary", requirePermission("payroll_reports.summary.view"), controller.monthlySummary);
payrollReportsRoutes.get("/employee-detail", requirePermission("payroll_reports.employee.view"), controller.employeeDetail);
payrollReportsRoutes.get("/salary-compensation", requirePermission("payroll_reports.salary.view"), controller.salaryCompensation);
payrollReportsRoutes.get("/salary-changes", requirePermission("payroll_reports.salary.view"), controller.salaryChanges);
payrollReportsRoutes.get("/deductions", requirePermission("payroll_reports.deductions.view"), controller.deductions);
payrollReportsRoutes.get("/advances", requirePermission("payroll_reports.advances.view"), controller.advances);
payrollReportsRoutes.get("/salary-loans", requirePermission("payroll_reports.loans.view"), controller.salaryLoans);
payrollReportsRoutes.get("/attendance-deductions", requirePermission("payroll_reports.attendance_deductions.view"), controller.attendanceDeductions);
payrollReportsRoutes.get("/overtime", requirePermission("payroll_reports.overtime.view"), controller.overtime);
payrollReportsRoutes.get("/long-leave-deductions", requireFeature("long_leave_management"), requirePermission("payroll_reports.long_leave.view"), controller.longLeaveDeductions);
payrollReportsRoutes.get("/leave-deductions", requireFeature("leave_management"), requirePermission("payroll_reports.leave_deductions.view"), controller.leaveDeductions);
payrollReportsRoutes.get("/payslip-status", requirePermission("payroll_reports.payslips.view"), controller.payslipStatus);
payrollReportsRoutes.get("/approval-finalization", requirePermission("payroll_reports.approvals.view"), controller.approvalFinalization);
payrollReportsRoutes.get("/outlet-cost", requirePermission("payroll_reports.cost.view"), controller.outletCost);
payrollReportsRoutes.get("/department-cost", requirePermission("payroll_reports.cost.view"), controller.departmentCost);
payrollReportsRoutes.get("/variance", requirePermission("payroll_reports.variance.view"), controller.variance);
payrollReportsRoutes.get("/audit", requirePermission("payroll_reports.audit.view"), controller.audit);
payrollReportsRoutes.get("/finance-summary", requirePermission("payroll_reports.finance_summary.view"), controller.financeSummary);
payrollReportsRoutes.get("/:reportKey", requireAnyPermission([
  "payroll_reports.summary.view",
  "payroll_reports.employee.view",
  "payroll_reports.salary.view",
  "payroll_reports.deductions.view",
  "payroll_reports.advances.view",
  "payroll_reports.loans.view",
  "payroll_reports.attendance_deductions.view",
  "payroll_reports.overtime.view",
  "payroll_reports.long_leave.view",
  "payroll_reports.leave_deductions.view",
  "payroll_reports.payslips.view",
  "payroll_reports.approvals.view",
  "payroll_reports.cost.view",
  "payroll_reports.variance.view",
  "payroll_reports.audit.view",
  "payroll_reports.finance_summary.view",
]), async (c) => {
  const key = c.req.param("reportKey");
  const map: Record<string, (typeof controller)[keyof typeof controller]> = {
    "monthly-summary": controller.monthlySummary,
    "employee-detail": controller.employeeDetail,
    "salary-compensation": controller.salaryCompensation,
    "salary-changes": controller.salaryChanges,
    deductions: controller.deductions,
    advances: controller.advances,
    "salary-loans": controller.salaryLoans,
    "attendance-deductions": controller.attendanceDeductions,
    overtime: controller.overtime,
    "long-leave-deductions": controller.longLeaveDeductions,
    "leave-deductions": controller.leaveDeductions,
    "payslip-status": controller.payslipStatus,
    "approval-finalization": controller.approvalFinalization,
    "outlet-cost": controller.outletCost,
    "department-cost": controller.departmentCost,
    variance: controller.variance,
    audit: controller.audit,
    "finance-summary": controller.financeSummary,
  };
  const handler = map[key];
  if (!handler) return controller.catalog(c);
  return handler(c);
});

export { payrollReportsRoutes };
