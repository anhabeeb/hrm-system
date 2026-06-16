import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const ModuleLandingShell = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("space-y-4", className)}>{children}</div>
);
