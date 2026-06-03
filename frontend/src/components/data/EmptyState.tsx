import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export const EmptyState = ({ title, description, actionLabel, onAction, icon }: EmptyStateProps) => (
  <div className="flex min-h-44 flex-col items-center justify-center gap-3 border-t bg-muted/20 px-6 py-10 text-center">
    {icon ? <div className="text-muted-foreground">{icon}</div> : null}
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {actionLabel ? (
      <Button size="sm" variant="outline" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null}
  </div>
);
