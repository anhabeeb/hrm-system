import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";

export const SecuritySettingsPage = () => (
  <div>
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={settingsPageDefinitions.security} /></div>
  </div>
);
