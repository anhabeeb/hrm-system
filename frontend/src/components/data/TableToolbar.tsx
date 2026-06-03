import type { ReactNode } from "react";
import { Download, Filter, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TableToolbarProps {
  title: string;
  description?: string;
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  filters?: ReactNode;
  createLabel?: string;
  onCreate?: () => void;
  onExport?: () => void;
}

export const TableToolbar = ({
  title,
  description,
  searchPlaceholder = "Search records",
  onSearch,
  filters,
  createLabel,
  onCreate,
  onExport,
}: TableToolbarProps) => (
  <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {onSearch ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="w-full pl-8 sm:w-64" placeholder={searchPlaceholder} onChange={(event) => onSearch(event.target.value)} />
          </div>
        ) : null}
        {filters ? (
          <Button variant="outline" type="button">
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        ) : null}
        {onExport ? (
          <Button variant="outline" type="button" onClick={onExport}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        ) : null}
        {createLabel ? (
          <Button type="button" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            {createLabel}
          </Button>
        ) : null}
      </div>
    </div>
    {filters ? <div className="border-t pt-3">{filters}</div> : null}
  </div>
);
