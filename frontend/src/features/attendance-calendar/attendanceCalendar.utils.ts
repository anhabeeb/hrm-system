import type { AttendanceCalendarStatus, AttendancePayrollImpact } from "./attendanceCalendar.types";

export const currentMonth = () => new Date().toISOString().slice(0, 7);

export const addMonths = (month: string, offset: number) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const statusTone = (status: AttendanceCalendarStatus) => {
  if (["PRESENT", "APPROVED_CORRECTION"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["LATE", "PENDING_CORRECTION", "MISSING_PUNCH", "REVIEW_REQUIRED"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700";
  if (["ABSENT", "REJECTED_CORRECTION"].includes(status)) return "border-red-200 bg-red-50 text-red-700";
  if (["LEAVE", "SICK", "HOLIDAY", "DAY_OFF"].includes(status)) return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

export const payrollImpactTone = (impact: AttendancePayrollImpact) => {
  if (impact === "PAID") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (impact === "DEDUCT" || impact === "UNPAID") return "border-red-200 bg-red-50 text-red-700";
  if (impact === "REVIEW_REQUIRED") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

export const formatMinutes = (minutes?: number | null) => {
  const value = Number(minutes ?? 0);
  if (!value) return "0m";
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
};

export const monthInputLabel = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};
