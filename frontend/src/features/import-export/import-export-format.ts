import { formatDateTime, humanize } from "@/lib/safe-display";

export const formatJobDate = (value?: string | null) => formatDateTime(value);
export const formatJobType = (value?: string | null) => humanize(value);
