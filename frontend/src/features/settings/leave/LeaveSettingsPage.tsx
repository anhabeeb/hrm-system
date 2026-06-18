import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";

export const LeaveSettingsPage = () => (
  <div>
    <div className="space-y-4 p-4 md:p-6">
      <ModuleAvailabilityPanel featureKey="leave_management" />
      <ModuleAvailabilityPanel featureKey="long_leave_management" />
      <StructuredSettingsPanel definition={settingsPageDefinitions.leave} />
    </div>
  </div>
);
