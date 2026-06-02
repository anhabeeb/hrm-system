import { sanitizeForDisplay } from "@/lib/safe-display";

export const sanitizeImportExportValue = <T,>(value: T): T => sanitizeForDisplay(value) as T;
export const sanitizeImportExportRows = <T,>(rows: T[] = []) => rows.map((row) => sanitizeImportExportValue(row));
