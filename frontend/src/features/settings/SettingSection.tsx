import type { ReactNode } from "react";

export const SettingSection = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <section className="rounded-lg border bg-card shadow-sm">
    <div className="border-b px-4 py-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    <div className="p-4">{children}</div>
  </section>
);
