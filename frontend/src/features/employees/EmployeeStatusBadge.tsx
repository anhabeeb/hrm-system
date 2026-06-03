import { StatusBadge } from "@/components/data/StatusBadge";
import type { EmploymentStatus } from "./employees.types";

export const EmployeeStatusBadge = ({ status }: { status?: EmploymentStatus | string | null }) => (
  <StatusBadge status={status ?? "neutral"} />
);
