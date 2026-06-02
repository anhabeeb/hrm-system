import { format } from "date-fns";

export const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "Not set";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return format(date, "dd MMM yyyy");
};

export const formatMoneyMinor = (amount: number | null | undefined, currency = "MVR") => {
  const value = amount ?? 0;
  return new Intl.NumberFormat("en-MV", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value / 100);
};
