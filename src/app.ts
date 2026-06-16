import { Hono } from "hono";

import { API_PREFIX, NOT_FOUND_MESSAGE } from "./config/constants";
import { corsMiddleware } from "./middleware/cors.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
import { requestIdMiddleware } from "./middleware/request-id.middleware";
import { securityHeadersMiddleware, unsafeRequestGuardMiddleware } from "./middleware/security.middleware";
import { authRoutes } from "./routes/auth.routes";
import { attendanceRoutes } from "./routes/attendance.routes";
import { advancesRoutes } from "./routes/advances.routes";
import { approvalsRoutes } from "./routes/approvals.routes";
import { assetsRoutes } from "./routes/assets.routes";
import { auditLogsRoutes } from "./routes/audit-logs.routes";
import { backupRecoveryRoutes } from "./routes/backup-recovery.routes";
import { biometricRoutes } from "./routes/biometric.routes";
import { bootstrapRoutes } from "./routes/bootstrap.routes";
import { companyRoutes } from "./routes/company.routes";
import { compensationComponentDefinitionsRoutes } from "./routes/compensation-component-definitions.routes";
import { contractsRoutes } from "./routes/contracts.routes";
import { departmentsRoutes } from "./routes/departments.routes";
import { devicesRoutes } from "./routes/devices.routes";
import { dashboardRoutes } from "./routes/dashboard.routes";
import { dataRetentionRoutes } from "./routes/data-retention.routes";
import { documentsRoutes } from "./routes/documents.routes";
import { employeeDisciplineRoutes } from "./routes/employee-discipline.routes";
import { employeesRoutes } from "./routes/employees.routes";
import { emailNotificationsRoutes } from "./routes/email-notifications.routes";
import { healthRoutes } from "./routes/health.routes";
import { holidaysRoutes } from "./routes/holidays.routes";
import { hrReportsRoutes } from "./routes/hr-reports.routes";
import { expiryAlertsRoutes } from "./routes/expiry-alerts.routes";
import { importExportRoutes } from "./routes/import-export.routes";
import { importsRoutes } from "./routes/imports.routes";
import { kioskRoutes } from "./routes/kiosk.routes";
import { leaveRoutes } from "./routes/leave.routes";
import { longLeaveRoutes } from "./routes/long-leave.routes";
import { offboardingRoutes } from "./routes/offboarding.routes";
import { notificationsRoutes } from "./routes/notifications.routes";
import { navigationRoutes } from "./routes/navigation.routes";
import { lookupsRoutes } from "./routes/lookups.routes";
import { organizationRoutes } from "./routes/organization.routes";
import { operationOwnershipRoutes } from "./routes/operation-ownership.routes";
import { outletsRoutes } from "./routes/outlets.routes";
import { payrollReportsRoutes } from "./routes/payroll-reports.routes";
import { payrollRoutes } from "./routes/payroll.routes";
import { payslipsRoutes } from "./routes/payslips.routes";
import { permissionsRoutes } from "./routes/permissions.routes";
import { positionsRoutes } from "./routes/positions.routes";
import { profileUpdateRequestsRoutes } from "./routes/profile-update-requests.routes";
import { reportsRoutes } from "./routes/reports.routes";
import { reportExportsRoutes } from "./routes/report-exports.routes";
import { rolesRoutes } from "./routes/roles.routes";
import { rostersRoutes } from "./routes/rosters.routes";
import { settingsRoutes } from "./routes/settings.routes";
import { salaryLoansRoutes } from "./routes/salary-loans.routes";
import { selfServiceRoutes } from "./routes/self-service.routes";
import { shiftTemplatesRoutes } from "./routes/shift-templates.routes";
import { syncRoutes } from "./routes/sync.routes";
import { uniformsRoutes } from "./routes/uniforms.routes";
import { usersRoutes } from "./routes/users.routes";
import { versionRoutes } from "./routes/version.routes";
import type { AppContext } from "./types/api.types";
import { errorResponse, notFound } from "./utils/response";

const app = new Hono<AppContext>();
const apiV1 = new Hono<AppContext>();

app.use("*", requestIdMiddleware);
app.use("*", securityHeadersMiddleware);
app.use("*", corsMiddleware);
app.use("*", unsafeRequestGuardMiddleware);
app.onError(errorMiddleware);

apiV1.route("/", healthRoutes);
apiV1.route("/version", versionRoutes);
apiV1.route("/bootstrap", bootstrapRoutes);
apiV1.route("/", authRoutes);
apiV1.route("/settings", settingsRoutes);
apiV1.route("/company", companyRoutes);
apiV1.route("/dashboard", dashboardRoutes);
apiV1.route("/compensation-component-definitions", compensationComponentDefinitionsRoutes);
apiV1.route("/attendance", attendanceRoutes);
apiV1.route("/shift-templates", shiftTemplatesRoutes);
apiV1.route("/rosters", rostersRoutes);
apiV1.route("/kiosk", kioskRoutes);
apiV1.route("/sync", syncRoutes);
apiV1.route("/devices", devicesRoutes);
apiV1.route("/biometric", biometricRoutes);
apiV1.route("/leave", leaveRoutes);
apiV1.route("/long-leave", longLeaveRoutes);
apiV1.route("/holidays", holidaysRoutes);
apiV1.route("/notifications", notificationsRoutes);
apiV1.route("/navigation", navigationRoutes);
apiV1.route("/email-notifications", emailNotificationsRoutes);
apiV1.route("/expiry-alerts", expiryAlertsRoutes);
apiV1.route("/offboarding-cases", offboardingRoutes);
apiV1.route("/contracts", contractsRoutes);
apiV1.route("/lookups", lookupsRoutes);
apiV1.route("/organization", organizationRoutes);
apiV1.route("/payroll", payrollRoutes);
apiV1.route("/payroll-reports", payrollReportsRoutes);
apiV1.route("/payslips", payslipsRoutes);
apiV1.route("/advances", advancesRoutes);
apiV1.route("/salary-loans", salaryLoansRoutes);
apiV1.route("/approvals", approvalsRoutes);
apiV1.route("/assets", assetsRoutes);
apiV1.route("/uniforms", uniformsRoutes);
apiV1.route("/documents", documentsRoutes);
apiV1.route("/employee-discipline", employeeDisciplineRoutes);
apiV1.route("/reports", reportsRoutes);
apiV1.route("/report-exports", reportExportsRoutes);
apiV1.route("/hr-reports", hrReportsRoutes);
apiV1.route("/imports", importsRoutes);
apiV1.route("/import-export", importExportRoutes);
apiV1.route("/backup-recovery", backupRecoveryRoutes);
apiV1.route("/data-retention", dataRetentionRoutes);
apiV1.route("/audit-logs", auditLogsRoutes);
apiV1.route("/employees", employeesRoutes);
apiV1.route("/users", usersRoutes);
apiV1.route("/roles", rolesRoutes);
apiV1.route("/permissions", permissionsRoutes);
apiV1.route("/outlets", outletsRoutes);
apiV1.route("/departments", departmentsRoutes);
apiV1.route("/positions", positionsRoutes);
apiV1.route("/profile-update-requests", profileUpdateRequestsRoutes);
apiV1.route("/self", selfServiceRoutes);
apiV1.route("/operation-ownership", operationOwnershipRoutes);

app.route(API_PREFIX, apiV1);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return errorResponse(
      404,
      "API_ROUTE_NOT_FOUND",
      "The requested API endpoint does not exist.",
      {
        requestId: c.get("requestId"),
        route: c.req.path,
        method: c.req.method,
        title: "API route not found",
        retryable: false,
      },
    );
  }

  return notFound(NOT_FOUND_MESSAGE, "ENDPOINT_NOT_FOUND", {
    requestId: c.get("requestId"),
    route: c.req.path,
    method: c.req.method,
  });
});

export default app;
