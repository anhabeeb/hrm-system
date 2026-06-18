import { useQuery } from "@tanstack/react-query";

import { DetailSection } from "@/components/data/DetailSection";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { settingsApi } from "./settings.api";

export const ApprovalSettingsPanel = () => {
  const query = useQuery({ queryKey: ["settings", "approvals"], queryFn: settingsApi.approvals });
  if (query.isError) return <InlineAlert title="Approval settings could not be loaded." variant="error" />;
  const value = query.data?.data.value ?? {};
  return (
    <div className="space-y-3">
      <DetailSection title="Approval Behavior" rows={[
        { label: "Approval mode", value: String(value.approval_mode ?? "Not configured") },
        { label: "Workflows enabled", value: String(value.approval_workflows_enabled ?? "Not configured") },
        { label: "Auto Admin/Super Admin", value: String(value.auto_approve_for_admin_superadmin ?? "Not configured") },
      ]} />
      <InlineAlert title="Workflow step guidance" variant="info" persistent>
        Finance approval is optional and only used when included in the configured workflow. Valid leave examples include HR only, Department Senior to Manager to HR, and Manager to HR to Finance for payroll-impact leave when Finance is configured.
      </InlineAlert>
    </div>
  );
};
