export const MALDIVES_TIME_ZONE = "Indian/Maldives";

const toValidDate = (value: string | Date): Date | null => {
  const parsedDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

export const getCurrentIsoDate = (date = new Date()): string => date.toISOString();

export const formatPayrollMonth = (value: string | Date = new Date()): string => {
  const date = toValidDate(value);

  if (!date) {
    return "";
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export interface ParsedDateRange {
  startDate: Date | null;
  endDate: Date | null;
}

export const parseDateRange = (
  startDate?: string | null,
  endDate?: string | null,
): ParsedDateRange => ({
  startDate: startDate ? toValidDate(startDate) : null,
  endDate: endDate ? toValidDate(endDate) : null,
});

// Future attendance, leave, and payroll date boundaries should align to Maldives local time.
