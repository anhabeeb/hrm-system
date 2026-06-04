import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const BackupSettingsPage = () => (
  <div>
    <PageHeader title="Backup & Recovery Settings" description="Backup schedule, retention, restore approval, and health controls without exposing secrets." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={additionalSettingsPageDefinitions.backup} /></div>
  </div>
);
