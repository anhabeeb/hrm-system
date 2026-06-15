import type { ReactNode } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { WidgetSkeleton } from "./WidgetSkeleton";

export interface WidgetCardProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export const WidgetCard = ({
  title,
  description,
  icon,
  action,
  children,
  loading,
  error,
  empty,
  footer,
  className,
}: WidgetCardProps) => (
  <Card className={cn("overflow-hidden border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
    <CardHeader className="flex-row items-start justify-between gap-3 border-b border-slate-100 p-3">
      <div className="flex min-w-0 items-start gap-2">
        {icon ? <div className="mt-0.5 rounded-md border bg-slate-50 p-1.5 text-slate-600">{icon}</div> : null}
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">{title}</CardTitle>
          {description ? <CardDescription className="mt-1 text-xs">{description}</CardDescription> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </CardHeader>
    <CardContent className="p-3">
      {loading ? <WidgetSkeleton /> : error ? <InlineAlert title="Widget could not be loaded." variant="error">{error}</InlineAlert> : empty ? empty : children}
    </CardContent>
    {footer ? <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-muted-foreground">{footer}</div> : null}
  </Card>
);
