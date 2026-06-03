import { ApiError } from "@/lib/api-errors";

export type LockedPayrollContext = "payroll" | "leave" | "long_leave" | "advance" | "salary_loan" | "deduction" | "approval";

const lockedMessages: Record<LockedPayrollContext, string> = {
  payroll: "This payroll period is locked.",
  leave: "This leave affects a locked payroll period.",
  long_leave: "This long leave affects a locked payroll period.",
  advance: "This advance affects a locked payroll period.",
  salary_loan: "This salary loan affects a locked payroll period.",
  deduction: "This deduction affects a locked payroll period.",
  approval: "This approval affects a locked payroll period.",
};

export const friendlyHrmError = (error: unknown, fallback: string, lockedContext: LockedPayrollContext = "payroll") => {
  if (error instanceof ApiError) {
    const message = error.message.toLowerCase();
    if (
      error.code === "RECORD_LOCKED" ||
      error.code === "PAYROLL_LOCKED" ||
      error.code === "PAYROLL_PERIOD_LOCKED" ||
      message.includes("locked payroll") ||
      message.includes("locked payroll period") ||
      message.includes("payroll period is locked")
    ) {
      return lockedMessages[lockedContext];
    }
    if (error.status === 403 || error.code.includes("PERMISSION") || error.code.includes("ACCESS_DENIED")) {
      return "You do not have permission to perform this action.";
    }
    if (message.includes("critical") && message.includes("exception")) {
      return "Critical payroll exceptions must be resolved before locking.";
    }
    return error.message || fallback;
  }
  return fallback;
};

export const isValidPayrollMonth = (value: string) => /^\d{4}-\d{2}$/.test(value);

export const isPositiveIntegerMinorUnits = (value: number) => Number.isInteger(value) && value > 0;
