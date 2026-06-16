import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireFeature } from "../middleware/feature.middleware";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware";
import * as attendanceCalendarController from "../modules/attendance/attendance-calendar.controller";
import * as weeklyTeamController from "../modules/dashboard/department-weekly-team.controller";
import * as controller from "../modules/self-service/self-service.controller";
import * as repository from "../modules/self-service/self-service.repository";
import { SELF_SERVICE_LINKED_EMPLOYEE_REQUIRED_MESSAGE } from "../modules/self-service/self-service.service";
import type { AppContext } from "../types/api.types";
import { AuthError, PermissionError } from "../utils/errors";

const selfServiceRoutes = new Hono<AppContext>();

const requireLinkedEmployeeForSelfService = createMiddleware<AppContext>(async (c, next) => {
  const context = c.get("authUser");
  if (!context) throw new AuthError("Please sign in to continue.");

  const row = await repository.findSelfProfile(c.env, context.companyId, context.actorUserId);
  const activeLinkedEmployee = Boolean(
    row?.employee_id &&
    !row.deleted_at &&
    !row.archived_at &&
    !["inactive", "archived", "deleted", "terminated", "resigned"].includes(String(row.employment_status ?? "").toLowerCase()),
  );
  if (!activeLinkedEmployee) {
    throw new PermissionError(SELF_SERVICE_LINKED_EMPLOYEE_REQUIRED_MESSAGE, "SELF_SERVICE_EMPLOYEE_PROFILE_REQUIRED");
  }

  await next();
});

selfServiceRoutes.use("*", authMiddleware);
selfServiceRoutes.use("*", requireLinkedEmployeeForSelfService);

selfServiceRoutes.get("/dashboard", requirePermission("self.dashboard.view"), controller.dashboard);
selfServiceRoutes.get("/profile", requireAnyPermission(["self.profile.view", "self.dashboard.view"]), controller.profile);
selfServiceRoutes.get("/access-summary", requirePermission("self.accessSummary.view"), controller.accessSummary);
selfServiceRoutes.get("/requests", requirePermission("self.requests.view"), controller.requests);
selfServiceRoutes.get("/attendance-calendar", requireFeature("attendance"), requireAnyPermission(["self.attendance.calendar.view", "self.attendance.view"]), attendanceCalendarController.selfAttendanceCalendar);
selfServiceRoutes.get("/department-dashboard/weekly-team-view", requireFeature("employee_management"), requireFeature("attendance"), requireAnyPermission(["department.dashboard.view", "departments.dashboard.viewTeam", "attendance.teamCalendar.view", "attendance.calendar.viewTeam", "employees.team.view"]), weeklyTeamController.selfWeeklyTeamView);
selfServiceRoutes.get("/department-dashboard/weekly-team-departments", requireFeature("employee_management"), requireFeature("attendance"), requireAnyPermission(["department.dashboard.view", "departments.dashboard.viewTeam", "attendance.teamCalendar.view", "attendance.calendar.viewTeam", "employees.team.view"]), weeklyTeamController.selfWeeklyTeamDepartments);
selfServiceRoutes.get("/pending-approvals", requireAnyPermission(["department.approvals.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"]), controller.pendingApprovals);
selfServiceRoutes.get("/navigation", requireAnyPermission(["self.dashboard.view", "self.profile.view", "self.requests.view"]), controller.navigation);

export { selfServiceRoutes };
