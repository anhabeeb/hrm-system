import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";

export const SecuritySettingsPage = () => (
  <div>
    <PageHeader title="Security Settings" description="Password, 2FA, session, login protection, and reset policy controls." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={settingsPageDefinitions.security} /></div>
  </div>
);
