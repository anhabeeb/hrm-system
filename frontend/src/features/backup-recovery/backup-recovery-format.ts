import { formatDateTime, humanize } from "@/lib/safe-display";

export const formatBackupDate = (value?: string | null) => formatDateTime(value);
export const formatBackupType = (value?: string | null) => humanize(value);
export const formatFileSize = (value?: number | null) => value ? `${new Intl.NumberFormat().format(value)} bytes` : "Not available";
