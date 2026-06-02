import { Badge } from "@/components/ui/badge";
import type { StatusVariant } from "@/types/common";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "muted" }> = {
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "muted" },
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  locked: { label: "Locked", variant: "secondary" },
  draft: { label: "Draft", variant: "outline" },
  completed: { label: "Completed", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  warning: { label: "Warning", variant: "warning" },
  critical: { label: "Critical", variant: "destructive" },
  disabled: { label: "Disabled", variant: "muted" },
  neutral: { label: "Neutral", variant: "outline" },
};

export const StatusBadge = ({ status, label }: { status: StatusVariant | string; label?: string }) => {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  const config = statusMap[normalized] ?? { label: status, variant: "outline" as const };
  return <Badge variant={config.variant}>{label ?? config.label}</Badge>;
};
