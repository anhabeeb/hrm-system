import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface AppDatePickerProps {
  value?: string;
  onChange: (value?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  clearable?: boolean;
  error?: string;
  label?: string;
  className?: string;
}

export const AppDatePicker = ({
  value,
  onChange,
  placeholder = "Select date",
  disabled,
  minDate,
  maxDate,
  clearable = true,
  error,
  label,
  className,
}: AppDatePickerProps) => (
  <Label className={cn("space-y-1 text-sm", className)}>
    {label ? <span>{label}</span> : null}
    <div className="flex items-center gap-2 rounded-md border bg-white px-2 py-1 focus-within:ring-2 focus-within:ring-ring">
      <Input
        aria-label={label ?? placeholder}
        className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
        disabled={disabled}
        max={maxDate}
        min={minDate}
        placeholder={placeholder}
        type="date"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
      {clearable && value ? (
        <Button aria-label="Clear date" disabled={disabled} size="icon" type="button" variant="ghost" className="h-7 w-7" onClick={() => onChange(undefined)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
    {error ? <span className="text-xs text-destructive">{error}</span> : null}
  </Label>
);
