import type { ReactNode } from "react";

export interface DetailRow {
  label: string;
  value: ReactNode;
}

export const DetailSection = ({ title, rows }: { title: string; rows: DetailRow[] }) => (
  <section className="rounded-lg border bg-card">
    <div className="border-b px-4 py-3">
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
    <dl className="divide-y">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
          <dt className="font-medium text-muted-foreground">{row.label}</dt>
          <dd className="col-span-2">{row.value}</dd>
        </div>
      ))}
    </dl>
  </section>
);
