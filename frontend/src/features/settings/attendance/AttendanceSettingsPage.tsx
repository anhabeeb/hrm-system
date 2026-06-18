import { InlineAlert } from "@/components/feedback/InlineAlert";
import { useAuth } from "@/features/auth/auth.store";

import { ModuleAvailabilityPanel } from "../ModuleAvailabilityPanel";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";

export const AttendanceSettingsPage = () => {
  const auth = useAuth();

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        <ModuleAvailabilityPanel featureKey="attendance" />
        {!auth.hasFeature("attendance") ? (
          <InlineAlert title="Attendance Management is currently disabled.">
            These sub-feature settings are preserved for re-enable review. Enable Attendance Management from this page&apos;s Module Availability section before normal attendance pages and actions become available.
          </InlineAlert>
        ) : null}
        <StructuredSettingsPanel definition={settingsPageDefinitions.attendance} />
      </div>
    </div>
  );
};
