import { Link } from "react-router-dom";

import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";

export const ProfilePage = () => {
  const { user, roles, outletIds } = useAuth();

  return (
    <div>
      <PageActionBar label="Profile page actions">
        <Button asChild variant="outline"><Link to="/profile/security">Change password</Link></Button>
        <Button asChild><Link to="/profile/kyc-update">Request profile update</Link></Button>
      </PageActionBar>
      <div className="space-y-4 p-4 md:p-6">
        <DetailSection
          title="Account details"
          rows={[
            { label: "Full name", value: user?.full_name ?? "Not available" },
            { label: "Email", value: user?.email ?? "Not available" },
            { label: "Phone", value: user?.phone ?? "Not available" },
            { label: "Roles", value: roles.length ? roles.join(", ") : "Not assigned" },
            { label: "Outlet access", value: outletIds.length ? outletIds.join(", ") : "Not assigned" },
            { label: "Employee ID", value: user?.employee_id ?? "Not linked" },
            { label: "Status", value: <StatusBadge status={user?.status ?? "active"} /> },
          ]}
        />
        <DetailSection
          title="Official information"
          rows={[
            { label: "Edit access", value: "Official employee fields cannot be edited directly from My Profile." },
            { label: "Update process", value: "Use Request profile update so HR can review and approve changes." },
            { label: "Sensitive data", value: "Password hashes, tokens, TOTP secrets, and backup codes are never displayed." },
          ]}
        />
      </div>
    </div>
  );
};
