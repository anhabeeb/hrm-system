import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const ModuleSummaryGrid = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("grid gap-3 md:grid-cols-3 xl:grid-cols-6", className)}>{children}</div>
);
