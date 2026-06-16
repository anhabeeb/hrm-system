import type { CurrentUser } from "@/types/auth";

import { getVisibleNavigation } from "@/config/navigation";
import { hasAnyPermission, hasPermission } from "./permissions";

export const adminDashboardPermissions = ["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"];
export const notificationPermissions = ["notifications.view", "notifications.manage_own"];

export const getDefaultLandingPath = (user: CurrentUser | null) => {
  if (hasAnyPermission(user, adminDashboardPermissions)) return "/dashboard";
  if (user?.employee_id && hasPermission(user, "self.dashboard.view")) return "/self/dashboard";
  if (hasAnyPermission(user, notificationPermissions)) return "/notifications";

  const firstVisibleItem = getVisibleNavigation(user).flatMap((group) => group.items)[0];
  return firstVisibleItem?.path ?? "/profile";
};
