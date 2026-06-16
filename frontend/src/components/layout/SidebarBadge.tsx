import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const SidebarBadge = ({ value, collapsed, warning }: { value?: number | string | null; collapsed?: boolean; warning?: boolean }) => {
  if (value === null || value === undefined || value === "" || value === 0) return null;

  if (collapsed) {
    return (
      <span
        className={cn(
          "absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-background",
          warning ? "bg-amber-500" : "bg-primary",
        )}
        aria-label={`${value} navigation item${warning ? " warning" : " badge"}`}
      />
    );
  }

  return (
    <Badge variant={warning ? "warning" : "muted"} className="ml-auto px-1.5 py-0 text-[10px]">
      {value}
    </Badge>
  );
};
