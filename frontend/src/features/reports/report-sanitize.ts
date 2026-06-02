import { sanitizeForDisplay } from "@/lib/safe-display";

export const sanitizeReportValue = <T,>(value: T): T => sanitizeForDisplay(value) as T;

export const sanitizeReportRows = <T,>(rows: T[] = []): T[] => rows.map((row) => sanitizeReportValue(row));
