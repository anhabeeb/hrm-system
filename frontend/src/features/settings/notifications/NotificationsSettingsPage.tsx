import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const NotificationsSettingsPage = () => (
  <div>
    <PageHeader title="Notification Settings" description="System notification settings and planned email notification controls." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={additionalSettingsPageDefinitions.notifications} /></div>
  </div>
);
