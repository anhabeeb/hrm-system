import { Button } from "@/components/ui/button";

import { AppDatePicker } from "./AppDatePicker";

export interface AppDateRangeValue {
  dateFrom?: string;
  dateTo?: string;
}

export interface AppDateRangePickerProps extends AppDateRangeValue {
  onChange: (value: AppDateRangeValue) => void;
  disabled?: boolean;
  clearable?: boolean;
  label?: string;
  fromLabel?: string;
  toLabel?: string;
}

export const AppDateRangePicker = ({
  dateFrom,
  dateTo,
  onChange,
  disabled,
  clearable = true,
  label,
  fromLabel = "From",
  toLabel = "To",
}: AppDateRangePickerProps) => {
  const invalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  return (
    <div className="space-y-1">
      {label ? <div className="text-sm font-medium">{label}</div> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <AppDatePicker value={dateFrom} disabled={disabled} maxDate={dateTo} label={fromLabel} onChange={(next) => onChange({ dateFrom: next, dateTo })} />
        <AppDatePicker value={dateTo} disabled={disabled} minDate={dateFrom} label={toLabel} onChange={(next) => onChange({ dateFrom, dateTo: next })} />
      </div>
      {invalid ? <p className="text-xs text-destructive">Start date must be before end date.</p> : null}
      {clearable && (dateFrom || dateTo) ? (
        <Button disabled={disabled} size="sm" type="button" variant="ghost" onClick={() => onChange({ dateFrom: undefined, dateTo: undefined })}>
          Clear date range
        </Button>
      ) : null}
    </div>
  );
};
