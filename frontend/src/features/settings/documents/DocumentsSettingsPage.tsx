import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const DocumentsSettingsPage = () => (
  <div>
    <div className="space-y-4 p-4 md:p-6">
      <ModuleAvailabilityPanel featureKey="documents" />
      <ModuleAvailabilityPanel featureKey="contract_tracking" />
      <StructuredSettingsPanel definition={additionalSettingsPageDefinitions.documents} />
    </div>
  </div>
);
