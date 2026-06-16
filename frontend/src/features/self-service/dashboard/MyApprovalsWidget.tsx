import { Link } from "react-router-dom";
import { FileCheck2 } from "lucide-react";

import { ActionQueueWidget } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asArray, visible } from "./selfServiceDashboard.utils";

export const MyApprovalsWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["my_approvals"] }) => {
  if (!visible(widget)) return null;
  const items = asArray(widget?.items);

  return (
    <ActionQueueWidget
      title="My Approvals"
      description="Approvals assigned or eligible for you."
      icon={<FileCheck2 className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/pending-approvals">Review</Link></Button>}
      rows={items.map((item) => ({
        id: String(item.id),
        moduleName: String(item.operation_type ?? "Approval"),
        count: 1,
        oldestPendingAge: String(item.submitted_at ?? item.updated_at ?? "-"),
        priority: String(item.status ?? "Pending"),
        href: "/self/pending-approvals",
      }))}
    />
  );
};
