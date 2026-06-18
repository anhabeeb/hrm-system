import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const ImportExportSettingsPage = () => (
  <div className="p-4 md:p-6">
    <div className="space-y-4">
      <ModuleAvailabilityPanel featureKey="import_export" />
      <StructuredSettingsPanel definition={additionalSettingsPageDefinitions.importExport} />
    </div>
  </div>
);
