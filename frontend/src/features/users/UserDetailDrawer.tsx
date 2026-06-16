import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { formatDate } from "@/lib/format";
import { roleList, userDisplayName } from "./user-format";
import { usersApi } from "./users.api";
import type { AdminUser } from "./users.types";

export const UserDetailDrawer = ({ user, open, onOpenChange }: { user: AdminUser | null; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const canViewSessions = auth.hasPermission("users.sessions.view") || auth.hasPermission("users.revoke_sessions");
  const canRevokeSessions = auth.hasPermission("users.sessions.revoke") || auth.hasPermission("users.revoke_sessions");
  const canRevokeAllSessions = auth.hasPermission("users.sessions.revoke_all") || auth.hasPermission("users.revoke_sessions");
  const [revokeTarget, setRevokeTarget] = useState<{ kind: "one"; sessionId: string } | { kind: "all" } | null>(null);
  const sessionsQuery = useQuery({
    queryKey: ["users", user?.id, "sessions"],
    queryFn: () => usersApi.sessions(user?.id ?? ""),
    enabled: open && Boolean(user?.id) && canViewSessions,
  });
  const revokeSession = useMutation({
    mutationFn: ({ sessionId, reason }: { sessionId: string; reason: string }) => usersApi.revokeSession(user?.id ?? "", sessionId, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users", user?.id, "sessions"] });
    },
  });
  const revokeAllSessions = useMutation({
    mutationFn: (reason: string) => usersApi.revokeAllSessions(user?.id ?? "", reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users", user?.id, "sessions"] });
    },
  });

  if (!user) return null;
  return (
    <DetailDrawer open={open} onOpenChange={onOpenChange} title={userDisplayName(user)} subtitle="Account access overview">
      <DetailSection title="Account" rows={[
        { label: "Name", value: userDisplayName(user) },
        { label: "Username", value: user.username ?? "Not assigned" },
        { label: "Email", value: user.email ?? "Not available" },
        { label: "Status", value: <StatusBadge status={user.status ?? "neutral"} /> },
      ]} />
      <DetailSection title="Linked Employee" rows={[
        { label: "Employee", value: user.employee_name ? `${user.employee_name} (${user.employee_code ?? user.employee_id ?? "No code"})` : "Not linked" },
      ]} />
      <DetailSection title="Roles" rows={[{ label: "Assigned roles", value: roleList(user.roles) }]} />
      <DetailSection title="Outlet Access" rows={[{ label: "Outlets", value: user.outlet_ids?.length ? user.outlet_ids.join(", ") : "Not assigned" }]} />
      <DetailSection title="Security" rows={[{ label: "Two-factor auth", value: user.two_factor_enabled ? "Enabled" : "Not enabled" }, { label: "Last login", value: formatDate(user.last_login_at) }]} />
      {canViewSessions ? (
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Active sessions</h3>
              <p className="text-xs text-muted-foreground">Safe device summaries only. Raw session tokens, IPs, and cookies are never shown.</p>
            </div>
            {canRevokeAllSessions ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={revokeAllSessions.isPending || (sessionsQuery.data?.data.sessions ?? []).length === 0}
                onClick={() => setRevokeTarget({ kind: "all" })}
              >
                Revoke all
              </Button>
            ) : null}
          </div>
          {sessionsQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading sessions...</div> : null}
          {sessionsQuery.isError ? <div className="text-sm text-destructive">Sessions could not be loaded.</div> : null}
          {!sessionsQuery.isLoading && !sessionsQuery.isError ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full divide-y text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Device</th>
                    <th className="px-3 py-2 font-medium">Last active</th>
                    <th className="px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-background">
                  {(sessionsQuery.data?.data.sessions ?? []).map((session) => (
                    <tr key={session.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{session.device_label ?? session.user_agent_summary ?? "Browser session"}</div>
                        <div className="text-xs text-muted-foreground">{session.ip_summary ?? "IP unavailable"}</div>
                      </td>
                      <td className="px-3 py-2">{formatDate(session.last_seen_at ?? session.created_at)}</td>
                      <td className="px-3 py-2 text-right">
                        {canRevokeSessions ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={revokeSession.isPending}
                            onClick={() => setRevokeTarget({ kind: "one", sessionId: session.id })}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {(sessionsQuery.data?.data.sessions ?? []).length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={3}>No active sessions found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
      <ReasonDialog
        open={Boolean(revokeTarget)}
        title={revokeTarget?.kind === "all" ? "Revoke all sessions" : "Revoke session"}
        description="A reason is required before revoking account session access."
        confirmLabel={revokeTarget?.kind === "all" ? "Revoke all sessions" : "Revoke session"}
        loading={revokeSession.isPending || revokeAllSessions.isPending}
        onOpenChange={(openDialog) => { if (!openDialog) setRevokeTarget(null); }}
        onSubmit={(reason) => {
          if (!revokeTarget) return;
          if (revokeTarget.kind === "all") revokeAllSessions.mutate(reason);
          else revokeSession.mutate({ sessionId: revokeTarget.sessionId, reason });
          setRevokeTarget(null);
        }}
      />
    </DetailDrawer>
  );
};
