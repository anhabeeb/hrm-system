import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const SidebarSearch = ({ value, onChange, collapsed }: { value: string; onChange: (value: string) => void; collapsed?: boolean }) => {
  if (collapsed) return null;

  return (
    <label className="relative block px-2 pb-2">
      <Search className="pointer-events-none absolute left-5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search navigation"
        className={cn("h-9 rounded-md border-slate-200 bg-background pl-9 text-sm")}
        aria-label="Search visible navigation"
      />
    </label>
  );
};
