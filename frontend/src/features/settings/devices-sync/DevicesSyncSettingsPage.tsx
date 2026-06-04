import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { additionalSettingsPageDefinitions } from "../structured-settings";

export const DevicesSyncSettingsPage = () => (
  <div>
    <PageHeader title="Devices & Sync Settings" description="Device registration, biometric push, local bridge, offline sync, and realtime notification controls." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={additionalSettingsPageDefinitions.devicesSync} /></div>
  </div>
);
