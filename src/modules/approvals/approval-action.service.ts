import { AppError } from "../../utils/errors";

import { TERMINAL_APPROVAL_STATUSES } from "./approvals.constants";

export const assertApprovalIsActionable = (status: string): void => {
  if ((TERMINAL_APPROVAL_STATUSES as readonly string[]).includes(status)) {
    throw new AppError("This approval request has already been completed.", "APPROVAL_ALREADY_COMPLETED", 409);
  }
};

export const assertNotSelfApproval = (requestedBy: string | null | undefined, actorUserId: string): void => {
  if (requestedBy && requestedBy === actorUserId) {
    throw new AppError("You cannot approve your own request.", "SELF_APPROVAL_NOT_ALLOWED", 403);
  }
};
