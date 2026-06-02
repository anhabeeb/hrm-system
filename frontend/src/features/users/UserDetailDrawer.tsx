import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate } from "@/lib/format";
import { roleList, userDisplayName } from "./user-format";
import type { AdminUser } from "./users.types";

export const UserDetailDrawer = ({ user, open, onOpenChange }: { user: AdminUser | null; open: boolean; onOpenChange: (open: boolean) => void }) => {
  if (!user) return null;
  return (
    <DetailDrawer open={open} onOpenChange={onOpenChange} title={userDisplayName(user)} subtitle="Account access overview">
      <DetailSection title="Account" rows={[
        { label: "Name", value: userDisplayName(user) },
        { label: "Email", value: user.email ?? "Not available" },
        { label: "Status", value: <StatusBadge status={user.status ?? "neutral"} /> },
      ]} />
      <DetailSection title="Roles" rows={[{ label: "Assigned roles", value: roleList(user.roles) }]} />
      <DetailSection title="Outlet Access" rows={[{ label: "Outlets", value: user.outlet_ids?.length ? user.outlet_ids.join(", ") : "Not assigned" }]} />
      <DetailSection title="Security" rows={[{ label: "Two-factor auth", value: user.two_factor_enabled ? "Enabled" : "Not enabled" }, { label: "Last login", value: formatDate(user.last_login_at) }]} />
    </DetailDrawer>
  );
};
