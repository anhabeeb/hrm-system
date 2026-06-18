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
import { featureDisplay, mainFeatureOrder, nonDestructiveModuleWarning, setupTargetByFeature } from "./module-feature-metadata";
import { settingsApi } from "./settings.api";
import type { FeatureSetting } from "./settings.types";

const formatChangedAt = (value?: string) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
};

const enabledFeatureKeys = (features: FeatureSetting[]) =>
  new Set(
    features
      .filter((feature) => feature.is_enabled === 1 && ["active", "enabled"].includes(feature.status))
      .map((feature) => feature.feature_key),
  );

export const FeatureSettingsPanel = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [pendingChange, setPendingChange] = useState<{ feature: FeatureSetting; enabled: boolean } | null>(null);
  const toast = useToast();
  const canManage = auth.hasAnyPermission(["feature_settings.manage", "settings.manage"]);
  const query = useQuery({ queryKey: ["settings", "features"], queryFn: settingsApi.features });
  const mutation = useMutation({
    mutationFn: ({ feature, enabled, reason, effective_from }: { feature: FeatureSetting; enabled: boolean; reason: string; effective_from: string }) =>
      settingsApi.updateFeature(feature.feature_key, { is_enabled: enabled, status: enabled ? "active" : "disabled", reason, effective_from }),
    onSuccess: async () => {
      toastSuccess(toast, "Feature setting updated successfully.");
      setPendingChange(null);
      await queryClient.invalidateQueries({ queryKey: ["settings", "features"] });
      await auth.refreshMe();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["navigation"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-preferences"] }),
      ]);
    },
    onError: (error) => toastError(toast, error, "Feature setting could not be updated."),
  });

  const toggleFeature = (feature: FeatureSetting, enabled: boolean) => {
    setPendingChange({ feature, enabled });
  };

  if (query.isError) return <InlineAlert title="Feature settings could not be loaded." variant="error" />;

  const allFeatures = query.data?.data.features ?? [];
  const enabledFeatures = enabledFeatureKeys(allFeatures);
  const featureMap = new Map(allFeatures.map((feature) => [feature.feature_key, feature]));
  const featureRows = mainFeatureOrder
    .map((featureKey) => featureMap.get(featureKey))
    .filter((feature): feature is FeatureSetting => Boolean(feature));

  const missingDependencies = (feature: FeatureSetting) =>
    (featureDisplay[feature.feature_key]?.dependencies ?? []).filter((dependency) => !enabledFeatures.has(dependency));
  const activeDependents = (feature: FeatureSetting) =>
    featureRows.filter(
      (candidate) =>
        candidate.is_enabled === 1 &&
        candidate.feature_key !== feature.feature_key &&
        (featureDisplay[candidate.feature_key]?.dependencies ?? []).includes(feature.feature_key),
    );
  const dependencyWarning =
    pendingChange && !pendingChange.enabled
      ? activeDependents(pendingChange.feature)
          .map((dependent) => featureDisplay[dependent.feature_key]?.name ?? dependent.feature_name)
          .join(", ")
      : "";

  return (
    <div className="space-y-3" data-setup-target="feature-controls">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">Feature Controls</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Choose which optional HRM modules are enabled for launch. Enabled modules add setup tasks; disabled modules are preserved as disabled by choice and can be enabled later.
        </p>
      </div>
      <DataTable
        compact
        loading={query.isLoading}
        rows={featureRows}
        getRowId={(row) => row.feature_key}
        emptyTitle="No primary module controls found."
        emptyDescription="Primary module settings will appear here once feature settings are seeded."
        columns={[
          {
            key: "feature_name",
            header: "Feature",
            cell: (row) => (
              <div className="max-w-md space-y-1" data-setup-target={setupTargetByFeature[row.feature_key] ?? `feature-${row.feature_key.replace(/_/g, "-")}`}>
                <p className="font-medium">{featureDisplay[row.feature_key]?.name ?? row.feature_name}</p>
                {featureDisplay[row.feature_key]?.description ? (
                  <p className="text-xs text-muted-foreground">{featureDisplay[row.feature_key].description}</p>
                ) : null}
                {featureDisplay[row.feature_key]?.warning ? (
                  <p className="text-xs text-muted-foreground">{featureDisplay[row.feature_key].warning}</p>
                ) : null}
              </div>
            ),
          },
          { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.is_enabled === 1 ? "active" : "disabled"} /> },
          {
            key: "dependencies",
            header: "Dependencies",
            cell: (row) => {
              const dependencyKeys = featureDisplay[row.feature_key]?.dependencies ?? [];
              const missing = missingDependencies(row);
              const dependents = activeDependents(row);
              if (!dependencyKeys.length) return <span className="text-sm text-muted-foreground">None</span>;
              return (
                <div className="max-w-xs text-xs">
                  <p className="text-muted-foreground">Requires {dependencyKeys.map((key) => featureDisplay[key]?.name ?? key).join(", ")}</p>
                  {missing.length ? (
                    <p className="mt-1 font-medium text-amber-700">
                      Enable {missing.map((key) => featureDisplay[key]?.name ?? key).join(", ")} first.
                    </p>
                  ) : null}
                  {dependents.length ? (
                    <p className="mt-1 text-muted-foreground">
                      Required by: {dependents.map((dependent) => featureDisplay[dependent.feature_key]?.name ?? dependent.feature_name).join(", ")}
                    </p>
                  ) : null}
                </div>
              );
            },
          },
          {
            key: "affects",
            header: "Impact",
            cell: (row) =>
              [
                row.affects_payroll ? "Payroll" : null,
                row.affects_attendance ? "Attendance" : null,
                row.affects_leave ? "Leave" : null,
                row.affects_roster ? "Roster" : null,
              ].filter(Boolean).join(", ") || "Operational",
          },
          {
            key: "audit",
            header: "Audit",
            cell: (row) => (
              <div className="text-xs text-muted-foreground">
                <p>{row.audit_enabled === 0 ? "Audit optional" : "Audit on"}</p>
                <p>Last changed: {formatChangedAt(row.updated_at)}</p>
                {row.effective_from ? <p>Effective from: {row.effective_from}</p> : null}
              </div>
            ),
          },
          {
            key: "enabled",
            header: "Enabled",
            cell: (row) => {
              const blockedByDependency = row.is_enabled !== 1 && missingDependencies(row).length > 0;
              return (
                <Switch
                  checked={row.is_enabled === 1}
                  disabled={!canManage || mutation.isPending || blockedByDependency}
                  onCheckedChange={(value) => toggleFeature(row, Boolean(value))}
                  aria-label={`Toggle ${featureDisplay[row.feature_key]?.name ?? row.feature_name}`}
                />
              );
            },
          },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        Only the primary optional modules are shown here. Sub-feature controls live inside Attendance and Payroll settings.
      </p>
      <p className="text-xs text-muted-foreground">{nonDestructiveModuleWarning} Re-enabling restores access to preserved records and settings.</p>
      {!canManage ? <p className="text-xs text-muted-foreground">Feature switches are disabled because you do not have settings management permission.</p> : null}
      <FeatureReasonDialog
        open={Boolean(pendingChange)}
        feature={pendingChange?.feature ?? null}
        nextEnabled={pendingChange?.enabled ?? false}
        loading={mutation.isPending}
        error={mutation.error instanceof ApiError ? mutation.error : null}
        dependencyWarning={
          dependencyWarning
            ? `${dependencyWarning} depends on ${featureDisplay[pendingChange?.feature.feature_key ?? ""]?.name ?? pendingChange?.feature.feature_name}. Disable dependent modules first.`
            : null
        }
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) {
            setPendingChange(null);
            mutation.reset();
          }
        }}
        onConfirm={({ reason, effective_from }) => {
          if (!pendingChange) return;
          mutation.mutate({ ...pendingChange, reason, effective_from });
        }}
      />
    </div>
  );
};
