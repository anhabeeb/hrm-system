import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";

export const LeaveSettingsPage = () => (
  <div>
    <div className="space-y-4 p-4 md:p-6">
      <ModuleAvailabilityPanel featureKey="leave_management" />
      <ModuleAvailabilityPanel featureKey="long_leave_management" />
      <section className="rounded-lg border bg-card p-4 shadow-sm" data-setup-target="leave-policy-rules">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Leave Policy Rules</h2>
            <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
              Configure document requirements, salary deduction rules, allowance/pay component deductions, approval behavior, and entitlement rules for each leave type.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/leave/policy-rules">Open Leave Policy Rules</Link>
          </Button>
        </div>
      </section>
      <StructuredSettingsPanel definition={settingsPageDefinitions.leave} />
    </div>
  </div>
);
