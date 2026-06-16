import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface AppMonthPickerProps {
  value?: string;
  onChange: (value?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  error?: string;
  label?: string;
  className?: string;
}

export const AppMonthPicker = ({
  value,
  onChange,
  placeholder = "Select month",
  disabled,
  clearable = true,
  error,
  label,
  className,
}: AppMonthPickerProps) => (
  <Label className={cn("space-y-1 text-sm", className)}>
    {label ? <span>{label}</span> : null}
    <div className="flex items-center gap-2 rounded-md border bg-white px-2 py-1 focus-within:ring-2 focus-within:ring-ring">
      <Input
        aria-label={label ?? placeholder}
        className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
        disabled={disabled}
        placeholder={placeholder}
        type="month"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
      {clearable && value ? (
        <Button aria-label="Clear month" disabled={disabled} size="icon" type="button" variant="ghost" className="h-7 w-7" onClick={() => onChange(undefined)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
    {error ? <span className="text-xs text-destructive">{error}</span> : null}
  </Label>
);
