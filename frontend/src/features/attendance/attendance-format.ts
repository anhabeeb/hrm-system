import { formatDate, formatDateTime, humanize } from "@/lib/safe-display";

export { formatDate, formatDateTime, humanize };

export const attendanceStatusLabel = humanize;

export const attendanceIssueText = (issues?: string[] | string, issueType?: string) => {
  if (Array.isArray(issues) && issues.length > 0) return issues.map(humanize).join(", ");
  if (typeof issues === "string" && issues) return humanize(issues);
  return issueType ? humanize(issueType) : "None";
};
