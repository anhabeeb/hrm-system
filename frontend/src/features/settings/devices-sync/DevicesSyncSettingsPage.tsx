import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const DevicesSyncSettingsPage = () => (
  <div className="p-4 md:p-6">
    <div className="space-y-4">
      <ModuleAvailabilityPanel featureKey="offline_sync" />
      <StructuredSettingsPanel definition={additionalSettingsPageDefinitions.devicesSync} />
    </div>
  </div>
);
