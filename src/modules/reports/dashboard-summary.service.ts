import type { AuthActor } from "../../types/api.types";
import * as permissionService from "../../services/permission.service";
import * as repository from "./reports.repository";

export const getDashboardSummary = async (env: Env, context: AuthActor) => {
  const employee = await repository.employeeSummary(env, context, {});
  const attendance = await repository.attendanceSummary(env, context, {
    date_from: new Date().toISOString().slice(0, 10),
    date_to: new Date().toISOString().slice(0, 10),
  });
  const leave = await repository.leaveSummary(env, context, {
    date_from: new Date().toISOString().slice(0, 10),
    date_to: new Date().toISOString().slice(0, 10),
  });

  const summary: Record<string, unknown> = {
    total_active_employees: employee.summary.active_employees ?? 0,
    employees_on_leave_today: leave.summary.approved_requests ?? 0,
    checked_in_today: attendance.summary.checked_in_count ?? 0,
    missing_clock_out_today: attendance.summary.missing_clock_out_count ?? 0,
    pending_leave_requests: leave.summary.pending_requests ?? 0,
  };

  if (permissionService.hasPermission(context, "documents.view")) {
    const outlet = repository.outletClause(context, "e.primary_outlet_id");
    const docs = await repository.simpleCount(
      env,
      `SELECT
        SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date <= date('now', '+30 day') THEN 1 ELSE 0 END) AS documents_expiring_soon,
        0 AS missing_required_documents
       FROM employee_documents d
       JOIN employees e ON e.id = d.employee_id AND e.company_id = d.company_id
       WHERE d.company_id = ? AND d.deleted_at IS NULL${outlet.sql}`,
      [context.companyId, ...outlet.values],
    );
    summary.documents_expiring_soon = docs?.documents_expiring_soon ?? 0;
    summary.missing_required_documents = docs?.missing_required_documents ?? 0;
  }

  if (permissionService.hasPermission(context, "payroll.view")) {
    const payroll = await repository.simpleCount(
      env,
      "SELECT payroll_month, status FROM payroll_runs WHERE company_id = ? ORDER BY payroll_month DESC LIMIT 1",
      [context.companyId],
    );
    summary.latest_payroll_status = payroll ?? null;
  }

  return summary;
};
