import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const ReportsSettingsPage = () => (
  <div className="p-4 md:p-6">
    <div className="space-y-4">
      <ModuleAvailabilityPanel featureKey="reports" />
      <StructuredSettingsPanel definition={additionalSettingsPageDefinitions.reports} />
    </div>
  </div>
);
