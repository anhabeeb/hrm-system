import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const DashboardGrid = ({
  children,
  className,
  compact = false,
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) => (
  <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", compact ? "gap-2" : "gap-3", className)}>
    {children}
  </div>
);
