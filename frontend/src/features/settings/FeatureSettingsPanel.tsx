import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";
import { FeatureReasonDialog } from "./FeatureReasonDialog";
import { settingsApi } from "./settings.api";
import type { FeatureSetting } from "./settings.types";

export const FeatureSettingsPanel = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [pendingChange, setPendingChange] = useState<{ feature: FeatureSetting; enabled: boolean } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canManage = auth.hasAnyPermission(["feature_settings.manage", "settings.manage"]);
  const query = useQuery({ queryKey: ["settings", "features"], queryFn: settingsApi.features });
  const mutation = useMutation({
    mutationFn: ({ feature, enabled, reason }: { feature: FeatureSetting; enabled: boolean; reason: string }) =>
      settingsApi.updateFeature(feature.feature_key, { is_enabled: enabled, status: enabled ? "active" : "disabled", reason }),
    onSuccess: async () => {
      setSuccessMessage("Feature setting updated successfully.");
      setPendingChange(null);
      await queryClient.invalidateQueries({ queryKey: ["settings", "features"] });
    },
  });

  const toggleFeature = (feature: FeatureSetting, enabled: boolean) => {
    setSuccessMessage(null);
    setPendingChange({ feature, enabled });
  };

  if (query.isError) return <InlineAlert title="Feature settings could not be loaded." variant="error" />;

  return (
    <div className="space-y-3">
      {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
      <DataTable
        compact
        loading={query.isLoading}
        rows={query.data?.data.features ?? []}
        getRowId={(row) => row.feature_key}
        emptyTitle="No feature settings found."
        columns={[
          { key: "feature_name", header: "Feature" },
          { key: "feature_key", header: "Key" },
          { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.is_enabled === 1 ? "active" : "disabled"} /> },
          { key: "affects", header: "Impact", cell: (row) => [row.affects_payroll ? "Payroll" : null, row.affects_attendance ? "Attendance" : null, row.affects_leave ? "Leave" : null].filter(Boolean).join(", ") || "Operational" },
          { key: "enabled", header: "Enabled", cell: (row) => <Switch checked={row.is_enabled === 1} disabled={!canManage || mutation.isPending} onCheckedChange={(value) => toggleFeature(row, Boolean(value))} aria-label={`Toggle ${row.feature_name}`} /> },
        ]}
      />
      {!canManage ? <p className="text-xs text-muted-foreground">Feature switches are disabled because you do not have settings management permission.</p> : null}
      <FeatureReasonDialog
        open={Boolean(pendingChange)}
        feature={pendingChange?.feature ?? null}
        nextEnabled={pendingChange?.enabled ?? false}
        loading={mutation.isPending}
        error={mutation.error instanceof ApiError ? mutation.error : null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) {
            setPendingChange(null);
            mutation.reset();
          }
        }}
        onConfirm={(reason) => {
          if (!pendingChange) return;
          mutation.mutate({ ...pendingChange, reason });
        }}
      />
    </div>
  );
};
