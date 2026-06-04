import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";

export const LeaveSettingsPage = () => (
  <div>
    <PageHeader title="Leave Settings" description="Leave policies, type defaults, statutory templates, and foreign employee long leave controls." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={settingsPageDefinitions.leave} /></div>
  </div>
);
