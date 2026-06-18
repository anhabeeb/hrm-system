import { Link } from "react-router-dom";
import {
  Bell,
  Building2,
  CalendarClock,
  Clock3,
  DatabaseBackup,
  FileSignature,
  FileText,
  Landmark,
  PackageCheck,
  ShieldCheck,
  Shirt,
  TabletSmartphone,
  UploadCloud,
  BarChart3,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FeatureSettingsPanel } from "./FeatureSettingsPanel";

const settingsLinks = [
  { title: "Company Information", description: "Company identity, contact, address, timezone, currency, and logo URL.", path: "/settings/company", icon: Building2 },
  { title: "Security", description: "Password, 2FA, session, login protection, and reset policies.", path: "/settings/security", icon: ShieldCheck },
  { title: "Attendance", description: "Manual attendance, corrections, kiosk, biometric, overtime, and lock controls.", path: "/settings/attendance", icon: Clock3 },
  { title: "Leave", description: "Leave policies, leave types, statutory templates, and long leave rules.", path: "/settings/leave", icon: CalendarClock },
  { title: "Payroll", description: "Payroll cycle, salary calculation, loans, approval, lock, and payslip settings.", path: "/settings/payroll", icon: Landmark },
  { title: "Documents", description: "Document module, expiry warnings, categories, and foreign employee expected documents.", path: "/settings/documents", icon: FileText },
  { title: "Asset Tracking", description: "Asset module availability, categories, issue/return rules, and preserved setup guidance.", path: "/settings/assets", icon: PackageCheck },
  { title: "Uniform Tracking", description: "Uniform module availability, uniform types, size options, and issue/return rules.", path: "/settings/uniforms", icon: Shirt },
  { title: "Duty Roster", description: "Roster module availability, shift templates, publishing, and roster approval guidance.", path: "/settings/roster", icon: CalendarClock },
  { title: "Contract Tracking", description: "Contract module availability, contract rules, document requirement, and renewal approval guidance.", path: "/settings/contracts", icon: FileSignature },
  { title: "Backup & Recovery", description: "Backup frequency, retention, restore approval, and health status.", path: "/settings/backup", icon: DatabaseBackup },
  { title: "Notifications", description: "System notifications and planned email notification controls.", path: "/settings/notifications", icon: Bell },
  { title: "Reports", description: "Export formats, masking, date range defaults, and report access controls.", path: "/settings/reports", icon: BarChart3 },
  { title: "Import / Export", description: "Import/export enablement, approval requirements, row limits, and duplicate behavior.", path: "/settings/import-export", icon: UploadCloud },
  { title: "Devices & Sync", description: "Kiosk, biometric, local bridge, offline sync, batch, retry, and realtime controls.", path: "/settings/devices-sync", icon: TabletSmartphone },
];

const setupGuidance = [
  {
    target: "employee-numbering",
    title: "Employee numbering",
    description: "Review employee ID format before bulk onboarding. Keep existing employee records unchanged.",
  },
  {
    target: "self-service-settings",
    title: "Self-service settings",
    description: "Confirm what linked employees can view or request before inviting employee accounts.",
  },
  {
    target: "approval-workflows",
    title: "Approval workflows",
    description: "Review module-aware approval routing for leave, attendance, roster, payroll, documents, and lifecycle operations.",
  },
  {
    target: "asset-issue-rules",
    title: "Asset issue rules",
    description: "Use Assets to manage issue/return records; keep rules consistent before issuing company property.",
  },
  {
    target: "uniform-issue-rules",
    title: "Uniform issue rules",
    description: "Use Uniforms to manage issue/return records; review return expectations before rollout.",
  },
];

export const SettingsPage = () => (
  <div>
    <div className="space-y-4 p-4 md:p-6">
      <div className="rounded-lg border bg-card p-4">
        <h1 className="text-lg font-semibold">All Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a module settings page to configure availability, effective date, and detailed options. Super Admins can still use the compact Feature Controls overview below.
        </p>
      </div>
      <FeatureSettingsPanel />
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2 xl:grid-cols-3">
        {setupGuidance.map((item) => (
          <div key={item.target} className="rounded-md border bg-slate-50 p-3" data-setup-target={item.target}>
            <p className="text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
    <div className="grid gap-4 p-4 md:grid-cols-2 md:p-6 xl:grid-cols-3">
      {settingsLinks.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.path} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Icon className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link to={item.path}>Open settings</Link>
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
