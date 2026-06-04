import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const DocumentsSettingsPage = () => (
  <div>
    <PageHeader title="Document Settings" description="Document safety, expiry warnings, categories, and foreign employee expected document controls." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={additionalSettingsPageDefinitions.documents} /></div>
  </div>
);
