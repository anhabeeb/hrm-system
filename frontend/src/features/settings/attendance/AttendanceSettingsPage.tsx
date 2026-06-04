import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";

export const AttendanceSettingsPage = () => (
  <div>
    <PageHeader title="Attendance Settings" description="Manual attendance, corrections, kiosk, biometric, overtime, and payroll-lock controls." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={settingsPageDefinitions.attendance} /></div>
  </div>
);
