import { ClipboardCheck } from "lucide-react";

import { ActionQueueWidget } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget } from "./commandCenter.utils";

export const ApprovalCommandQueueWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["approval_queue"] }) => {
  if (!shouldShowWidget(widget)) return null;
  return (
    <ActionQueueWidget
      title={widget.title}
      description={widget.description}
      icon={<ClipboardCheck className="h-4 w-4" />}
      rows={widget.rows ?? []}
      footer={widget.rows?.length ? undefined : "No pending approvals."}
    />
  );
};
