import type { AdminUser } from "./users.types";

export const userDisplayName = (user: AdminUser) => user.full_name ?? user.name ?? user.email ?? "Unnamed user";

export const roleList = (roles?: string[]) => roles?.length ? roles.join(", ") : "No roles assigned";
