import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";
import { FeatureReasonDialog } from "./FeatureReasonDialog";
import { settingsApi } from "./settings.api";
import type { FeatureSetting } from "./settings.types";

const featureDisplay: Record<string, { name: string; description: string }> = {
  leave_management: {
    name: "Leave Management",
    description: "Manage employee leave requests, balances, approvals, and leave history.",
  },
  long_leave_management: {
    name: "Long Leave Management",
    description: "Manage extended leave workflows, foreign employee long leave, salary deduction handling, and long leave history.",
  },
  documents: {
    name: "Document Tracking",
    description: "Track employee documents, KYC records, expiries, and verification status.",
  },
  asset_tracking: {
    name: "Asset Tracking",
    description: "Track company assets assigned to employees, including issue, return, and history.",
  },
  uniform_tracking: {
    name: "Uniform Tracking",
    description: "Track uniforms issued to employees, including sizes, quantities, issue dates, and return status.",
  },
};

export const FeatureSettingsPanel = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [pendingChange, setPendingChange] = useState<{ feature: FeatureSetting; enabled: boolean } | null>(null);
  const toast = useToast();
  const canManage = auth.hasAnyPermission(["feature_settings.manage", "settings.manage"]);
  const query = useQuery({ queryKey: ["settings", "features"], queryFn: settingsApi.features });
  const mutation = useMutation({
    mutationFn: ({ feature, enabled, reason }: { feature: FeatureSetting; enabled: boolean; reason: string }) =>
      settingsApi.updateFeature(feature.feature_key, { is_enabled: enabled, status: enabled ? "active" : "disabled", reason }),
    onSuccess: async () => {
      toastSuccess(toast, "Feature setting updated successfully.");
      setPendingChange(null);
      await queryClient.invalidateQueries({ queryKey: ["settings", "features"] });
    },
    onError: (error) => toastError(toast, error, "Feature setting could not be updated."),
  });

  const toggleFeature = (feature: FeatureSetting, enabled: boolean) => {
    setPendingChange({ feature, enabled });
  };

  if (query.isError) return <InlineAlert title="Feature settings could not be loaded." variant="error" />;

  return (
    <div className="space-y-3">
      <DataTable
        compact
        loading={query.isLoading}
        rows={query.data?.data.features ?? []}
        getRowId={(row) => row.feature_key}
        emptyTitle="No feature settings found."
        columns={[
          {
            key: "feature_name",
            header: "Feature",
            cell: (row) => (
              <div className="max-w-md">
                <p className="font-medium">{featureDisplay[row.feature_key]?.name ?? row.feature_name}</p>
                {featureDisplay[row.feature_key]?.description ? (
                  <p className="text-xs text-muted-foreground">{featureDisplay[row.feature_key].description}</p>
                ) : null}
              </div>
            ),
          },
          { key: "feature_key", header: "Key" },
          { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.is_enabled === 1 ? "active" : "disabled"} /> },
          { key: "affects", header: "Impact", cell: (row) => [row.affects_payroll ? "Payroll" : null, row.affects_attendance ? "Attendance" : null, row.affects_leave ? "Leave" : null].filter(Boolean).join(", ") || "Operational" },
          { key: "enabled", header: "Enabled", cell: (row) => <Switch checked={row.is_enabled === 1} disabled={!canManage || mutation.isPending} onCheckedChange={(value) => toggleFeature(row, Boolean(value))} aria-label={`Toggle ${row.feature_name}`} /> },
        ]}
      />
      <p className="text-xs text-muted-foreground">Disabling this module hides it from normal use but does not delete existing records.</p>
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
