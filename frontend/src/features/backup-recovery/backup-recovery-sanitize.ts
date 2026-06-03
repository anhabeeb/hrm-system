import { sanitizeForDisplay } from "@/lib/safe-display";

export const sanitizeBackupValue = <T,>(value: T): T => sanitizeForDisplay(value) as T;
export const sanitizeBackupRows = <T,>(rows: T[] = []) => rows.map((row) => sanitizeBackupValue(row));
