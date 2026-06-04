import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const ImportExportSettingsPage = () => (
  <div>
    <PageHeader title="Import / Export Settings" description="Import and export controls, approval requirements, row limits, and duplicate handling." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={additionalSettingsPageDefinitions.importExport} /></div>
  </div>
);
