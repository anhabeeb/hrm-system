import type { ReactNode } from "react";

export const FieldGroup = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <section className="space-y-4 rounded-lg border bg-card p-4">
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    <div className="grid gap-4 md:grid-cols-2">{children}</div>
  </section>
);
