import { PageHeader } from "@/components/layout/PageHeader";
import { StructuredSettingsPanel } from "../StructuredSettingsPanel";
import { settingsPageDefinitions } from "../structured-settings";
import { CompensationDefinitionsPanel } from "./CompensationDefinitionsPanel";

export const PayrollSettingsPage = () => (
  <div>
    <PageHeader title="Payroll Settings" description="Payroll cycle, salary calculation, advances, loans, approvals, locking, and payslip controls." />
    <div className="space-y-4 p-4 md:p-6">
      <CompensationDefinitionsPanel />
      <StructuredSettingsPanel definition={settingsPageDefinitions.payroll} />
    </div>
  </div>
);
