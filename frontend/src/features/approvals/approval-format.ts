import { humanize } from "@/lib/safe-display";
import type { ApprovalRequest } from "./approvals.types";

export const approvalTitle = (approval: ApprovalRequest) => approval.summary ?? `${humanize(approval.module)} ${humanize(approval.entity_type)} approval`;
export const boolish = (value: boolean | number | undefined) => value === true || value === 1;
