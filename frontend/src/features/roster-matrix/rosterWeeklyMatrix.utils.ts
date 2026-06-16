import type { RosterMatrixStatus } from "./rosterWeeklyMatrix.types";

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

export const rosterStatusClass = (status: RosterMatrixStatus) => {
  if (["SHIFT_ASSIGNED", "APPROVED_CHANGE"].includes(status)) return "border-green-200 bg-green-50 text-green-700";
  if (["PENDING_CHANGE", "HOLIDAY", "LEAVE", "SICK"].includes(status)) return "border-sky-200 bg-sky-50 text-sky-700";
  if (["CONFLICT", "DOUBLE_BOOKED"].includes(status)) return "border-red-200 bg-red-50 text-red-700";
  if (["DAY_OFF", "EMPTY", "NOT_ACTIVE", "OUTSIDE_EMPLOYMENT"].includes(status)) return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
};

export const rosterStatusOptions: Array<{ value: RosterMatrixStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "SHIFT_ASSIGNED", label: "Shift assigned" },
  { value: "DAY_OFF", label: "Day off" },
  { value: "LEAVE", label: "Leave" },
  { value: "SICK", label: "Sick" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "PENDING_CHANGE", label: "Pending change" },
  { value: "CONFLICT", label: "Conflict" },
  { value: "DOUBLE_BOOKED", label: "Double booked" },
  { value: "EMPTY", label: "Empty" },
];
