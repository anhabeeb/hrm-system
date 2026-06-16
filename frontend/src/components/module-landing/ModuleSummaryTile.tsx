import type { ReactNode } from "react";

import { MetricTile } from "@/components/widgets/MetricTile";

export const ModuleSummaryTile = ({
  label,
  value,
  helperText,
  status = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  helperText?: string;
  status?: "neutral" | "success" | "warning" | "danger" | "info";
  icon?: ReactNode;
}) => (
  <MetricTile label={label} value={value} helperText={helperText} status={status} icon={icon} />
);
