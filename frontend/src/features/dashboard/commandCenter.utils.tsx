import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { DashboardQuickAction } from "./dashboard.types";

export const n = (value: unknown) => Number(value ?? 0);

export const WidgetActions = ({ actions }: { actions?: DashboardQuickAction[] }) =>
  actions?.length ? (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button key={action.key} asChild size="sm" variant="outline">
          <Link to={action.href}>{action.label}</Link>
        </Button>
      ))}
    </div>
  ) : null;

export const widgetEmpty = (message: ReactNode) => (
  <p className="rounded-md border border-dashed bg-slate-50 px-3 py-4 text-sm text-muted-foreground">{message}</p>
);

export const shouldShowWidget = (widget: { enabled: boolean; visible: boolean }) => widget.enabled && widget.visible;
