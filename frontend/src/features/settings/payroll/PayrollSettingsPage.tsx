import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";

export const PayrollSettingsPage = () => (
  <div>
    <PageHeader title="Payroll Settings" description="Payroll cycle, salary calculation, advances, loans, approvals, locking, and payslip controls." />
    <div className="p-4 md:p-6"><StructuredSettingsPanel definition={settingsPageDefinitions.payroll} /></div>
  </div>
);
