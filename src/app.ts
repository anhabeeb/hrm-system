import { Hono } from "hono";

import { API_PREFIX, NOT_FOUND_MESSAGE } from "./config/constants";
import { corsMiddleware } from "./middleware/cors.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
import { requestIdMiddleware } from "./middleware/request-id.middleware";
import { authRoutes } from "./routes/auth.routes";
import { attendanceRoutes } from "./routes/attendance.routes";
import { advancesRoutes } from "./routes/advances.routes";
import { approvalsRoutes } from "./routes/approvals.routes";
import { assetsRoutes } from "./routes/assets.routes";
import { backupRecoveryRoutes } from "./routes/backup-recovery.routes";
import { biometricRoutes } from "./routes/biometric.routes";
import { bootstrapRoutes } from "./routes/bootstrap.routes";
import { departmentsRoutes } from "./routes/departments.routes";
import { devicesRoutes } from "./routes/devices.routes";
import { documentsRoutes } from "./routes/documents.routes";
import { employeesRoutes } from "./routes/employees.routes";
import { healthRoutes } from "./routes/health.routes";
import { importExportRoutes } from "./routes/import-export.routes";
import { kioskRoutes } from "./routes/kiosk.routes";
import { leaveRoutes } from "./routes/leave.routes";
import { longLeaveRoutes } from "./routes/long-leave.routes";
import { outletsRoutes } from "./routes/outlets.routes";
import { payrollRoutes } from "./routes/payroll.routes";
import { payslipsRoutes } from "./routes/payslips.routes";
<<<<<<< HEAD
import { positionsRoutes } from "./routes/positions.routes";
import { profileUpdateRequestsRoutes } from "./routes/profile-update-requests.routes";
import { reportsRoutes } from "./routes/reports.routes";
=======
import { permissionsRoutes } from "./routes/permissions.routes";
import { positionsRoutes } from "./routes/positions.routes";
import { profileUpdateRequestsRoutes } from "./routes/profile-update-requests.routes";
import { reportsRoutes } from "./routes/reports.routes";
import { rolesRoutes } from "./routes/roles.routes";
>>>>>>> 79432d0 (Initial HRM system source)
import { settingsRoutes } from "./routes/settings.routes";
import { salaryLoansRoutes } from "./routes/salary-loans.routes";
import { syncRoutes } from "./routes/sync.routes";
import { uniformsRoutes } from "./routes/uniforms.routes";
<<<<<<< HEAD
=======
import { usersRoutes } from "./routes/users.routes";
>>>>>>> 79432d0 (Initial HRM system source)
import type { AppContext } from "./types/api.types";
import { errorResponse, notFound } from "./utils/response";

const app = new Hono<AppContext>();
const apiV1 = new Hono<AppContext>();

app.use("*", requestIdMiddleware);
app.use("*", corsMiddleware);
app.onError(errorMiddleware);

apiV1.route("/", healthRoutes);
apiV1.route("/bootstrap", bootstrapRoutes);
apiV1.route("/", authRoutes);
apiV1.route("/settings", settingsRoutes);
apiV1.route("/attendance", attendanceRoutes);
apiV1.route("/kiosk", kioskRoutes);
apiV1.route("/sync", syncRoutes);
apiV1.route("/devices", devicesRoutes);
apiV1.route("/biometric", biometricRoutes);
apiV1.route("/leave", leaveRoutes);
apiV1.route("/long-leave", longLeaveRoutes);
apiV1.route("/payroll", payrollRoutes);
apiV1.route("/payslips", payslipsRoutes);
apiV1.route("/advances", advancesRoutes);
apiV1.route("/salary-loans", salaryLoansRoutes);
apiV1.route("/approvals", approvalsRoutes);
apiV1.route("/assets", assetsRoutes);
apiV1.route("/uniforms", uniformsRoutes);
apiV1.route("/documents", documentsRoutes);
apiV1.route("/reports", reportsRoutes);
apiV1.route("/import-export", importExportRoutes);
apiV1.route("/backup-recovery", backupRecoveryRoutes);
apiV1.route("/employees", employeesRoutes);
<<<<<<< HEAD
=======
apiV1.route("/users", usersRoutes);
apiV1.route("/roles", rolesRoutes);
apiV1.route("/permissions", permissionsRoutes);
>>>>>>> 79432d0 (Initial HRM system source)
apiV1.route("/outlets", outletsRoutes);
apiV1.route("/departments", departmentsRoutes);
apiV1.route("/positions", positionsRoutes);
apiV1.route("/profile-update-requests", profileUpdateRequestsRoutes);

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
