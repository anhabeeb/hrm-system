import type { ReactNode } from "react";

export const ModuleQuickActions = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2">{children}</div>
);
