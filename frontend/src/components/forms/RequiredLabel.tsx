import type { ReactNode } from "react";

export const RequiredLabel = ({ children }: { children: ReactNode }) => (
  <span>
    {children} <span className="text-destructive" aria-label="required">*</span>
  </span>
);
