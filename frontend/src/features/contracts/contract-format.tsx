import { StatusBadge } from "@/components/data/StatusBadge";
import { displayDate } from "@/features/employees/employee-format";
import type { ContractStatus } from "./contracts.types";

export const label = (value?: string | null) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not available";

export const contractStatusBadge = (status: ContractStatus | string) => {
  const variantStatus = status === "expiring_soon" ? "warning" : status === "expired" ? "critical" : status;
  return <StatusBadge status={variantStatus} label={label(status)} />;
};

export const expiryText = (endDate?: string | null, days?: number | null) => {
  if (!endDate) return "No end date";
  if (typeof days === "number") {
    if (days < 0) return `${displayDate(endDate)} (${Math.abs(days)} days overdue)`;
    if (days === 0) return `${displayDate(endDate)} (expires today)`;
    return `${displayDate(endDate)} (${days} days left)`;
  }
  return displayDate(endDate);
};
