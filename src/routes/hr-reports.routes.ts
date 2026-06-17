import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import * as controller from "../modules/hr-reports/hr-reports.controller";
import type { AppContext } from "../types/api.types";

const hrReportsRoutes = new Hono<AppContext>();

hrReportsRoutes.use("*", authMiddleware);
hrReportsRoutes.use("*", requireFeature("reports"));
hrReportsRoutes.get("/catalog", requirePermission("hr_reports.catalog.view"), controller.catalog);

hrReportsRoutes.use("*", requirePermission("hr_reports.view"));

hrReportsRoutes.get("/summary", controller.summary);
hrReportsRoutes.get("/employee-master", requirePermission("hr_reports.employee.view"), controller.employeeMaster);
hrReportsRoutes.get("/employee-status", requirePermission("hr_reports.employee.view"), controller.employeeStatus);
hrReportsRoutes.get("/local-foreign", requirePermission("hr_reports.employee.view"), controller.localForeign);
hrReportsRoutes.get("/headcount", requirePermission("hr_reports.employee.view"), controller.headcount);
hrReportsRoutes.get("/new-joiners", requirePermission("hr_reports.employee.view"), controller.newJoiners);
hrReportsRoutes.get("/probation", requirePermission("hr_reports.employee.view"), controller.probation);
hrReportsRoutes.get("/contracts", requirePermission("hr_reports.compliance.view"), controller.contracts);
hrReportsRoutes.get("/document-compliance", requirePermission("hr_reports.documents.view"), controller.documentCompliance);
hrReportsRoutes.get("/foreign-compliance", requirePermission("hr_reports.compliance.view"), controller.foreignCompliance);
hrReportsRoutes.get("/leave-balances", requirePermission("hr_reports.leave.view"), controller.leaveBalances);
hrReportsRoutes.get("/leave-requests", requirePermission("hr_reports.leave.view"), controller.leaveRequests);
hrReportsRoutes.get("/long-leave", requirePermission("hr_reports.long_leave.view"), controller.longLeave);
hrReportsRoutes.get("/assets-uniforms", requireFeature("asset_tracking"), requireFeature("uniform_tracking"), requirePermission("hr_reports.assets.view"), controller.assetsUniforms);
hrReportsRoutes.get("/compliance-summary", requirePermission("hr_reports.compliance.view"), controller.complianceSummary);
hrReportsRoutes.get("/lifecycle", requirePermission("hr_reports.lifecycle.view"), controller.lifecycle);
hrReportsRoutes.get("/employee-360-summary", requirePermission("hr_reports.employee_360.view"), controller.employee360Summary);
hrReportsRoutes.get("/:reportKey", requireAnyPermission([
  "hr_reports.employee.view",
  "hr_reports.compliance.view",
  "hr_reports.documents.view",
  "hr_reports.leave.view",
  "hr_reports.long_leave.view",
  "hr_reports.assets.view",
  "hr_reports.lifecycle.view",
  "hr_reports.employee_360.view",
]), async (c) => {
  const key = c.req.param("reportKey");
  const map: Record<string, (typeof controller)[keyof typeof controller]> = {
    "employee-master": controller.employeeMaster,
    "employee-status": controller.employeeStatus,
    "local-foreign": controller.localForeign,
    headcount: controller.headcount,
    "new-joiners": controller.newJoiners,
    probation: controller.probation,
    contracts: controller.contracts,
    "document-compliance": controller.documentCompliance,
    "foreign-compliance": controller.foreignCompliance,
    "leave-balances": controller.leaveBalances,
    "leave-requests": controller.leaveRequests,
    "long-leave": controller.longLeave,
    "assets-uniforms": controller.assetsUniforms,
    "compliance-summary": controller.complianceSummary,
    lifecycle: controller.lifecycle,
    "employee-360-summary": controller.employee360Summary,
  };
  const handler = map[key];
  if (!handler) return controller.catalog(c);
  if (key === "assets-uniforms") {
    await requireFeature("asset_tracking")(c, async () => undefined);
    await requireFeature("uniform_tracking")(c, async () => undefined);
  }
  return handler(c);
});

export { hrReportsRoutes };
