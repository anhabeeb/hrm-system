import { Badge } from "@/components/ui/badge";

import { WidgetCard, type WidgetCardProps } from "./WidgetCard";

export interface TimelineItem {
  id: string;
  title: string;
  description?: string | null;
  timestamp?: string | null;
  status?: string | null;
}

export const TimelineWidget = ({ items, ...props }: Omit<WidgetCardProps, "children"> & { items: TimelineItem[] }) => (
  <WidgetCard {...props}>
    {items.length === 0 ? (
      <p className="text-sm text-muted-foreground">No recent activity.</p>
    ) : (
      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="flex gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-slate-300" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{item.title}</p>
                {item.status ? <Badge variant="outline">{item.status}</Badge> : null}
              </div>
              {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
              {item.timestamp ? <p className="mt-1 text-[11px] text-muted-foreground">{item.timestamp}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    )}
  </WidgetCard>
);
