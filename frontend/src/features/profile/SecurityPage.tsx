import { useQuery } from "@tanstack/react-query";

import { DetailSection } from "@/components/data/DetailSection";
import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate } from "@/lib/format";

import { ChangePasswordForm } from "./ChangePasswordForm";
import { profileApi } from "./profile.api";
import { TwoFactorManagement } from "./TwoFactorManagement";

export const SecurityPage = () => {
  const securityQuery = useQuery({
    queryKey: ["profile-security"],
    queryFn: () => profileApi.security(),
  });

  return (
    <div>
      <PageHeader title="Security" description="Manage your password and two-factor authentication." />
      <div className="space-y-4 p-4 md:p-6">
        {securityQuery.isLoading ? <LoadingState rows={4} /> : null}
        {securityQuery.isError ? <InlineAlert title="Security details could not be loaded." variant="warning" /> : null}
        <DetailSection
          title="Security summary"
          rows={[
            { label: "Password updated", value: formatDate(securityQuery.data?.data.password_updated_at) },
            { label: "Two-factor authentication", value: securityQuery.data?.data.two_factor_enabled ? "Enabled" : "Not enabled" },
            { label: "Active sessions", value: securityQuery.data?.data.active_sessions_count ?? "Not available" },
            { label: "Last login", value: formatDate(securityQuery.data?.data.last_login_at) },
          ]}
        />
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">Change password</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Use a strong password and keep it private.</p>
          <ChangePasswordForm />
        </section>
        <TwoFactorManagement security={securityQuery.data?.data} />
      </div>
    </div>
  );
};
