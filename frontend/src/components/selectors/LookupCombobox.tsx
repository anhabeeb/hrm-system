import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { LookupFilters, LookupOption } from "./lookup-api";

export interface LookupComboboxProps {
  value?: string | null;
  onChange: (value: string | undefined) => void;
  queryKey: readonly unknown[];
  queryFn: (filters: LookupFilters) => Promise<{ data: LookupOption[] }>;
  filters?: LookupFilters;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
  disabled?: boolean;
  clearable?: boolean;
  error?: string;
  className?: string;
}

export const LookupCombobox = ({
  value,
  onChange,
  queryKey,
  queryFn,
  filters,
  placeholder = "Select record",
  searchPlaceholder = "Search...",
  emptyText = "No records found.",
  loadingText = "Loading...",
  disabled,
  clearable = true,
  error,
  className,
}: LookupComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const queryFilters = useMemo(() => ({ ...filters, search: search || undefined }), [filters, search]);
  const query = useQuery({
    queryKey: [...queryKey, queryFilters],
    queryFn: () => queryFn(queryFilters),
    enabled: !disabled,
  });
  const options = query.data?.data ?? [];
  const selected = options.find((option) => option.id === value);

  return (
    <div className={cn("space-y-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("w-full justify-between", !value && "text-muted-foreground", error && "border-destructive")}
          >
            <span className="truncate">{selected?.label ?? value ?? placeholder}</span>
            <span className="ml-2 flex shrink-0 items-center gap-1">
              {clearable && value && !disabled ? (
                <X
                  className="h-3.5 w-3.5 opacity-60"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange(undefined);
                  }}
                />
              ) : null}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={search} onValueChange={setSearch} placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{query.isLoading ? loadingText : emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.label}
                    onSelect={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === option.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
};
