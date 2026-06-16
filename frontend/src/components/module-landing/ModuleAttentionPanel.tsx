import type { ReactNode } from "react";

import { WidgetCard } from "@/components/widgets/WidgetCard";

export const ModuleAttentionPanel = ({
  title = "Needs attention",
  description,
  items,
  empty = "No urgent items in this view.",
}: {
  title?: string;
  description?: string;
  items: Array<ReactNode | null | false | undefined>;
  empty?: string;
}) => {
  const visibleItems = items.filter(Boolean);
  return (
    <WidgetCard title={title} description={description} empty={visibleItems.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : undefined}>
      {visibleItems.length ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item, index) => (
            <div key={index} className="rounded-md border bg-slate-50 px-3 py-2 text-sm">{item}</div>
          ))}
        </div>
      ) : null}
    </WidgetCard>
  );
};
