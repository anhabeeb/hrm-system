import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const ReportsSettingsPage = () => (
  <div>
    <PageHeader title="Report Settings" description="Export formats, masking, date defaults, and sensitive report access controls." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={additionalSettingsPageDefinitions.reports} /></div>
  </div>
);
