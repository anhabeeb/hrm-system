import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const FilterBar = ({
  children,
  search,
  searchPlaceholder = "Search records",
  onSearchChange,
  onClear,
  onApply,
}: {
  children: ReactNode;
  search?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  onClear?: () => void;
  onApply?: () => void;
}) => (
  <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:items-end md:justify-between">
    <div className="grid flex-1 gap-3 md:grid-cols-3">{children}</div>
    {onSearchChange ? (
      <div className="relative min-w-64">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" value={search ?? ""} placeholder={searchPlaceholder} onChange={(event) => onSearchChange(event.target.value)} />
      </div>
    ) : null}
    <div className="flex gap-2">
      <Button variant="outline" type="button" onClick={onClear} disabled={!onClear}>
        Clear
      </Button>
      <Button type="button" onClick={onApply} disabled={!onApply}>
        Apply
      </Button>
    </div>
  </div>
);
