import type { DepartmentWeeklyStatus } from "./departmentWeeklyTeam.types";

export const statusTone = (status: DepartmentWeeklyStatus) => {
  if (["PRESENT", "APPROVED_CORRECTION"].includes(status)) return "success" as const;
  if (["LATE", "PENDING_CORRECTION", "MISSING_PUNCH", "REVIEW_REQUIRED"].includes(status)) return "warning" as const;
  if (["ABSENT", "REJECTED_CORRECTION"].includes(status)) return "danger" as const;
  if (["LEAVE", "SICK", "HOLIDAY"].includes(status)) return "info" as const;
  return "neutral" as const;
};

export const statusBadgeClass = (status: DepartmentWeeklyStatus) => {
  const tone = statusTone(status);
  if (tone === "success") return "border-green-200 bg-green-50 text-green-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "info") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
};

export const addDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

export const currentWeekStart = () => {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const day = today.getUTCDay();
  return addDays(iso, day === 0 ? -6 : 1 - day);
};
