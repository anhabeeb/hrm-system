import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { LoadingState } from "@/components/data/LoadingState";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { featureDisplay, mainFeatureOrder } from "./module-feature-metadata";
import { settingsApi } from "./settings.api";
import type { FeatureSetting } from "./settings.types";

const moduleSettingsPath: Record<string, string> = {
  documents: "/settings/documents",
  asset_tracking: "/settings/assets",
  uniform_tracking: "/settings/uniforms",
  leave_management: "/settings/leave",
  long_leave_management: "/settings/leave",
  roster: "/settings/roster",
  contract_tracking: "/settings/contracts",
  attendance: "/settings/attendance",
  payroll: "/settings/payroll",
};

const formatChangedAt = (value?: string) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
};

export const ModuleStatusOverview = () => {
  const query = useQuery({ queryKey: ["settings", "features"], queryFn: settingsApi.features });

  if (query.isLoading) return <LoadingState rows={3} />;
  if (query.isError) return <InlineAlert title="Module status could not be loaded." variant="error" />;

  const featureMap = new Map((query.data?.data.features ?? []).map((feature) => [feature.feature_key, feature]));
  const rows = mainFeatureOrder.map((featureKey) => featureMap.get(featureKey)).filter((feature): feature is FeatureSetting => Boolean(feature));

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm" data-setup-target="module-status-overview">
      <div>
        <h2 className="text-base font-semibold">Module Status Overview</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Review enabled and disabled modules here. Enable, disable, and set effective dates inside each module&apos;s own settings page.
        </p>
      </div>
      <DataTable
        compact
        rows={rows}
        getRowId={(row) => row.feature_key}
        emptyTitle="No module status records found."
        columns={[
          {
            key: "feature_name",
            header: "Module",
            cell: (row) => (
              <div className="max-w-md space-y-1">
                <p className="font-medium">{featureDisplay[row.feature_key]?.name ?? row.feature_name}</p>
                <p className="text-xs text-muted-foreground">{featureDisplay[row.feature_key]?.description ?? row.feature_name}</p>
              </div>
            ),
          },
          { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.is_enabled === 1 ? "active" : "disabled"} /> },
          {
            key: "effective_from",
            header: "Effective from",
            cell: (row) => <span className="text-sm text-muted-foreground">{row.effective_from ?? "Not scheduled"}</span>,
          },
          {
            key: "updated_at",
            header: "Last changed",
            cell: (row) => <span className="text-sm text-muted-foreground">{formatChangedAt(row.updated_at)}</span>,
          },
        ]}
        rowActions={(row) => (
          <Button asChild variant="outline" size="sm">
            <Link to={moduleSettingsPath[row.feature_key] ?? "/settings"}>Open module settings</Link>
          </Button>
        )}
      />
    </section>
  );
};
