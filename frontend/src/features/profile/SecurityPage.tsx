import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DetailSection } from "@/components/data/DetailSection";
import { LoadingState } from "@/components/data/LoadingState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

import { ChangePasswordForm } from "./ChangePasswordForm";
import { profileApi } from "./profile.api";
import { TwoFactorManagement } from "./TwoFactorManagement";

export const SecurityPage = () => {
  const queryClient = useQueryClient();
  const securityQuery = useQuery({
    queryKey: ["profile-security"],
    queryFn: () => profileApi.security(),
  });
  const sessionsQuery = useQuery({
    queryKey: ["profile-sessions"],
    queryFn: () => profileApi.sessions(),
  });
  const revokeSession = useMutation({
    mutationFn: (id: string) => profileApi.revokeSession(id),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["profile-sessions"] });
      await queryClient.invalidateQueries({ queryKey: ["profile-security"] });
      if (response.data.current_session_revoked) {
        window.location.assign("/login");
      }
    },
  });

  return (
    <div>
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
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3">
            <h2 className="text-base font-semibold">My sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review active sign-ins and revoke sessions you no longer use.</p>
          </div>
          {sessionsQuery.isError ? <InlineAlert title="Active sessions could not be loaded." variant="warning" /> : null}
          {sessionsQuery.isLoading ? <LoadingState rows={3} /> : null}
          {!sessionsQuery.isLoading && !sessionsQuery.isError ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full divide-y text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Device</th>
                    <th className="px-3 py-2 font-medium">IP</th>
                    <th className="px-3 py-2 font-medium">Last active</th>
                    <th className="px-3 py-2 font-medium">Expires</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-background">
                  {(sessionsQuery.data?.data.sessions ?? []).map((session) => (
                    <tr key={session.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{session.device_label ?? session.user_agent_summary ?? "Browser session"}</div>
                        {session.current ? <div className="text-xs text-muted-foreground">Current session</div> : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{session.ip_summary ?? "Not available"}</td>
                      <td className="px-3 py-2">{formatDate(session.last_seen_at ?? session.created_at)}</td>
                      <td className="px-3 py-2">{formatDate(session.expires_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={session.current ? "destructive" : "outline"}
                          disabled={revokeSession.isPending}
                          onClick={() => revokeSession.mutate(session.id)}
                        >
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(sessionsQuery.data?.data.sessions ?? []).length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>No active sessions found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        <TwoFactorManagement security={securityQuery.data?.data} />
      </div>
    </div>
  );
};
