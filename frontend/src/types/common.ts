import type { ReactNode } from "react";

export type StatusVariant =
  | "active"
  | "inactive"
  | "pending"
  | "approved"
  | "rejected"
  | "locked"
  | "draft"
  | "completed"
  | "failed"
  | "warning"
  | "critical"
  | "disabled"
  | "neutral";

export interface TableColumn<T> {
  key: keyof T | string;
  header: ReactNode;
  cell?: (row: T) => ReactNode;
  className?: string;
}
