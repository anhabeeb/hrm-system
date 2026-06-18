import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const BackupSettingsPage = () => (
  <div className="p-4 md:p-6">
    <div className="space-y-4">
      <ModuleAvailabilityPanel featureKey="backup_recovery" />
      <StructuredSettingsPanel definition={additionalSettingsPageDefinitions.backup} />
    </div>
  </div>
);
