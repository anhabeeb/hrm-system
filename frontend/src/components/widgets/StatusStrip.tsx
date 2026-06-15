import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const dotClasses: Record<StatusTone, string> = {
  neutral: "bg-slate-400",
  success: "bg-green-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
};

export interface StatusStripItem {
  label: string;
  value: string | number;
  status?: StatusTone;
  colorKey?: string;
}

export const StatusStrip = ({ items, compact = false, className }: { items: StatusStripItem[]; compact?: boolean; className?: string }) => (
  <div className={cn("flex flex-wrap items-center gap-2", className)}>
    {items.map((item) => (
      <Badge key={`${item.label}-${item.colorKey ?? item.status ?? "neutral"}`} variant="outline" className={cn("gap-1.5 bg-white", compact ? "px-1.5 py-0" : "px-2 py-1")}>
        <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[item.status ?? "neutral"])} />
        <span className="text-muted-foreground">{item.label}</span>
        <span className="font-semibold text-foreground">{item.value}</span>
      </Badge>
    ))}
  </div>
);
