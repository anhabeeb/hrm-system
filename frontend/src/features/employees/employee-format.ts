import { formatDate, formatMoneyMinor } from "@/lib/format";
import type { Employee } from "./employees.types";

export const employeeName = (employee?: Pick<Employee, "employee_code" | "full_name"> | null) =>
  employee ? `${employee.employee_code} - ${employee.full_name}` : "Not available";

export const displayDate = (value?: string | null) => value ? formatDate(value) : "Not available";

export const displayMoney = (amount?: number | null, currency = "MVR") =>
  typeof amount === "number" ? formatMoneyMinor(amount, currency) : "Not available";
