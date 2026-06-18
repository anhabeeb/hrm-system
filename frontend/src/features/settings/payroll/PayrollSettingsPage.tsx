import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";
import { CompensationDefinitionsPanel } from "./CompensationDefinitionsPanel";

export const PayrollSettingsPage = () => (
  <div>
    <div className="space-y-4 p-4 md:p-6">
      <ModuleAvailabilityPanel featureKey="payroll" />
      <CompensationDefinitionsPanel />
      <StructuredSettingsPanel definition={settingsPageDefinitions.payroll} />
    </div>
  </div>
);
