import { Link } from "react-router-dom";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";

const ModuleSettingsShell = ({
  featureKey,
  title,
  description,
  setupTargets,
  managePath,
}: {
  featureKey: string;
  title: string;
  description: string;
  setupTargets: Array<{ target: string; label: string; description: string }>;
  managePath: string;
}) => (
  <div className="p-4 md:p-6">
    <div className="space-y-4">
      <ModuleAvailabilityPanel featureKey={featureKey} />
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={managePath}>Open module workspace</Link>
          </Button>
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-2">
        {setupTargets.map((item) => (
          <div key={item.target} className="rounded-lg border bg-card p-4 shadow-sm" data-setup-target={item.target}>
            <p className="text-sm font-medium">{item.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
      <InlineAlert title="Module settings remain available while disabled">
        Super Admins and authorized settings users can keep this page open to review preserved settings and re-enable the module. Operational module pages stay hidden or blocked while the module is disabled.
      </InlineAlert>
    </div>
  </div>
);

export const AssetsSettingsPage = () => (
  <ModuleSettingsShell
    featureKey="asset_tracking"
    title="Asset Tracking settings"
    description="Configure asset module availability and review issue/return setup guidance."
    managePath="/assets"
    setupTargets={[
      { target: "asset-categories", label: "Asset categories", description: "Define practical asset categories before assigning company property." },
      { target: "asset-issue-rules", label: "Asset issue rules", description: "Review issue, return, and audit expectations before rollout." },
    ]}
  />
);

export const UniformsSettingsPage = () => (
  <ModuleSettingsShell
    featureKey="uniform_tracking"
    title="Uniform Tracking settings"
    description="Configure uniform module availability and review uniform issue/return setup guidance."
    managePath="/uniforms"
    setupTargets={[
      { target: "uniform-types", label: "Uniform types", description: "Define uniform types and size options before issuing uniforms." },
      { target: "uniform-issue-rules", label: "Uniform issue rules", description: "Review issue, return, and replacement expectations before rollout." },
    ]}
  />
);

export const RosterSettingsPage = () => (
  <ModuleSettingsShell
    featureKey="roster"
    title="Duty Roster settings"
    description="Configure Duty Roster availability and review shift template and approval setup guidance."
    managePath="/rosters"
    setupTargets={[
      { target: "shift-templates", label: "Shift templates", description: "Create reusable shift templates before publishing rosters." },
      { target: "roster-approvals", label: "Roster approvals", description: "Confirm whether roster changes need approval before use." },
    ]}
  />
);

export const ContractsSettingsPage = () => (
  <ModuleSettingsShell
    featureKey="contract_tracking"
    title="Contract Tracking settings"
    description="Configure contract module availability and review contract expiry, probation, document, and renewal setup guidance."
    managePath="/contracts"
    setupTargets={[
      { target: "contract-rules", label: "Contract rules", description: "Review contract type, expiry, probation, and document rules." },
      { target: "contract-renewal-approval", label: "Contract renewal approval", description: "Confirm whether contract renewal workflows require approval." },
    ]}
  />
);
