import { Badge } from "@/components/ui/badge";

export const label = (value?: string | null) =>
  (value ?? "-").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export const crossesMidnight = (start?: string | null, end?: string | null) =>
  Boolean(start && end && end <= start);

export const formatTimeRange = (start?: string | null, end?: string | null) =>
  start && end ? `${start} -> ${end}${crossesMidnight(start, end) ? " (+1 day)" : ""}` : "-";

export const statusBadge = (status: string) => {
  const variant = status === "published" || status === "active"
    ? "default"
    : status === "cancelled" || status === "inactive"
      ? "secondary"
      : "outline";
  return <Badge variant={variant}>{label(status)}</Badge>;
};

export const conflictBadge = (count?: number, blocking?: number) => {
  if (!count) return <Badge variant="outline">Clear</Badge>;
  if (blocking) return <Badge variant="destructive">{blocking} blocking</Badge>;
  return <Badge variant="secondary">{count} warning</Badge>;
};

export const severityBadge = (severity: string) =>
  <Badge variant={severity === "error" ? "destructive" : "secondary"}>{label(severity)}</Badge>;
