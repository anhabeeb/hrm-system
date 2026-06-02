import { SlidersHorizontal } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApprovalSettingsPanel } from "./ApprovalSettingsPanel";
import { AttendanceSettingsPanel } from "./AttendanceSettingsPanel";
import { BackupSettingsPanel } from "./BackupSettingsPanel";
import { CompanySettingsPanel } from "./CompanySettingsPanel";
import { DocumentSettingsPanel } from "./DocumentSettingsPanel";
import { FeatureSettingsPanel } from "./FeatureSettingsPanel";
import { LeaveSettingsPanel } from "./LeaveSettingsPanel";
import { PayrollSettingsPanel } from "./PayrollSettingsPanel";
import { SettingSection } from "./SettingSection";

export const SettingsPage = () => (
  <div>
    <PageHeader title="Settings" description="Company configuration and module settings foundation" />
    <div className="space-y-4 p-4 md:p-6">
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <SlidersHorizontal className="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Settings Foundation</h2>
            <p className="text-sm text-muted-foreground">Light-only, sectioned settings UI. No dark mode or theme switching settings are exposed.</p>
          </div>
        </div>
      </div>
      <Tabs defaultValue="company" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>
        <TabsContent value="company"><SettingSection title="Company Settings" description="Company-level settings returned by the backend."><CompanySettingsPanel /></SettingSection></TabsContent>
        <TabsContent value="features"><SettingSection title="Feature Settings" description="Feature flags are managed through the real settings feature endpoints."><FeatureSettingsPanel /></SettingSection></TabsContent>
        <TabsContent value="attendance"><SettingSection title="Attendance Settings"><AttendanceSettingsPanel /></SettingSection></TabsContent>
        <TabsContent value="leave"><SettingSection title="Leave Settings"><LeaveSettingsPanel /></SettingSection></TabsContent>
        <TabsContent value="payroll"><SettingSection title="Payroll Settings"><PayrollSettingsPanel /></SettingSection></TabsContent>
        <TabsContent value="approvals"><SettingSection title="Approval Settings"><ApprovalSettingsPanel /></SettingSection></TabsContent>
        <TabsContent value="documents"><SettingSection title="Document Settings"><DocumentSettingsPanel /></SettingSection></TabsContent>
        <TabsContent value="backup"><SettingSection title="Backup Settings"><BackupSettingsPanel /></SettingSection></TabsContent>
      </Tabs>
    </div>
  </div>
);
