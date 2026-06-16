import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ModuleLandingHeader = ({
  title,
  description,
  status,
  actions,
  className,
}: {
  title: string;
  description: string;
  status?: string | null;
  actions?: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between", className)}>
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {status ? <Badge variant="outline">{status}</Badge> : null}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);
