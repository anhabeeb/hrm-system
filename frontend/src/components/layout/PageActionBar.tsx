import type { ReactNode } from "react";

export const PageActionBar = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-3 md:px-6" aria-label={label}>
    {children}
  </div>
);
