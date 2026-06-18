import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { LoadingState } from "@/components/data/LoadingState";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";
import { FeatureReasonDialog } from "./FeatureReasonDialog";
import { featureDisplay, mainFeatureOrder, nonDestructiveModuleWarning } from "./module-feature-metadata";
import { settingsApi } from "./settings.api";
import type { FeatureSetting } from "./settings.types";

const formatChangedAt = (value?: string) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
};

const enabledFeatureKeys = (features: FeatureSetting[]) =>
  new Set(features.filter((feature) => feature.is_enabled === 1 && ["active", "enabled"].includes(feature.status)).map((feature) => feature.feature_key));

export const ModuleAvailabilityPanel = ({ featureKey }: { featureKey: string }) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pendingChange, setPendingChange] = useState<{ feature: FeatureSetting; enabled: boolean } | null>(null);
  const canManage = auth.hasAnyPermission(["feature_settings.manage", "settings.manage"]);
  const query = useQuery({ queryKey: ["settings", "features"], queryFn: settingsApi.features });
  const mutation = useMutation({
    mutationFn: ({ feature, enabled, reason, effective_from }: { feature: FeatureSetting; enabled: boolean; reason: string; effective_from: string }) =>
      settingsApi.updateFeature(feature.feature_key, { is_enabled: enabled, status: enabled ? "active" : "disabled", reason, effective_from }),
    onSuccess: async () => {
      toastSuccess(toast, "Module availability updated successfully.");
      setPendingChange(null);
      await queryClient.invalidateQueries({ queryKey: ["settings", "features"] });
      await auth.refreshMe();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["navigation"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-preferences"] }),
      ]);
    },
    onError: (error) => toastError(toast, error, "Module availability could not be updated."),
  });

  if (query.isLoading) return <LoadingState rows={2} />;
  if (query.isError) return <InlineAlert title="Module availability could not be loaded." variant="error" />;

  const features = query.data?.data.features ?? [];
  const feature = features.find((item) => item.feature_key === featureKey);
  if (!feature) return <InlineAlert title="Module availability setting is not available." variant="warning" />;

  const enabledFeatures = enabledFeatureKeys(features);
  const metadata = featureDisplay[feature.feature_key] ?? { name: feature.feature_name, description: feature.feature_name, warning: nonDestructiveModuleWarning };
  const dependencies = metadata.dependencies ?? [];
  const missingDependencies = dependencies.filter((dependency) => !enabledFeatures.has(dependency));
  const activeDependents = mainFeatureOrder
    .map((key) => features.find((item) => item.feature_key === key))
    .filter((item): item is FeatureSetting => Boolean(item))
    .filter((candidate) => candidate.is_enabled === 1 && (featureDisplay[candidate.feature_key]?.dependencies ?? []).includes(feature.feature_key));
  const isEnabled = feature.is_enabled === 1 && ["active", "enabled"].includes(feature.status);
  const blockedByDependency = !isEnabled && missingDependencies.length > 0;
  const dependencyWarning =
    pendingChange && !pendingChange.enabled && activeDependents.length
      ? `${activeDependents.map((dependent) => featureDisplay[dependent.feature_key]?.name ?? dependent.feature_name).join(", ")} depends on ${metadata.name}. Disable dependent modules first.`
      : null;

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm" data-setup-target={`availability-${featureKey.replace(/_/g, "-")}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{metadata.name} availability</h2>
            <StatusBadge status={isEnabled ? "active" : "disabled"} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{metadata.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">{metadata.warning}</p>
        </div>
        <Button
          type="button"
          disabled={!canManage || mutation.isPending || blockedByDependency}
          variant={isEnabled ? "outline" : "default"}
          onClick={() => setPendingChange({ feature, enabled: !isEnabled })}
        >
          {isEnabled ? "Disable module" : "Enable module"}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Dependencies</p>
          <p className={missingDependencies.length ? "text-amber-700" : "text-muted-foreground"}>
            {dependencies.length ? dependencies.map((dependency) => featureDisplay[dependency]?.name ?? dependency).join(", ") : "None"}
          </p>
          {missingDependencies.length ? <p className="mt-1 text-xs text-amber-700">Enable required dependencies first.</p> : null}
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Required by</p>
          <p className="text-muted-foreground">
            {activeDependents.length ? activeDependents.map((dependent) => featureDisplay[dependent.feature_key]?.name ?? dependent.feature_name).join(", ") : "No active dependents"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Audit</p>
          <p className="text-muted-foreground">Last changed: {formatChangedAt(feature.updated_at)}</p>
          <p className="text-muted-foreground">Effective from: {feature.effective_from ?? "Not recorded"}</p>
        </div>
      </div>
      {!canManage ? <p className="mt-3 text-xs text-muted-foreground">You need settings management permission to change module availability.</p> : null}
      <FeatureReasonDialog
        open={Boolean(pendingChange)}
        feature={pendingChange?.feature ?? null}
        nextEnabled={pendingChange?.enabled ?? false}
        loading={mutation.isPending}
        error={mutation.error instanceof ApiError ? mutation.error : null}
        dependencyWarning={dependencyWarning}
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
    </section>
  );
};
