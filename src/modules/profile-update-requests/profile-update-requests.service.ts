import { ALLOWED_PROFILE_UPDATE_REQUEST_TYPES } from "./profile-update-requests.constants";
import type {
  ProfileUpdateRequestFilters,
  ProfileUpdateRequestRecord,
  ReviewInput,
} from "./profile-update-requests.types";
import * as repository from "./profile-update-requests.repository";
import { assertAllowedRequestType } from "./profile-update-requests.validators";
import { createAuditLog } from "../../services/audit.service";
import { broadcastEvent } from "../../services/realtime.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createEntityId } from "../../utils/ids";

const parseJson = (value: string): Record<string, unknown> => {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new ValidationError("The requested profile update data is not valid.");
  }
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const isEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const readEmailUpdate = (value: Record<string, unknown>): string => {
  const email = typeof value.email === "string" ? normalizeEmail(value.email) : "";
  if (!email || !isEmail(email)) {
    throw new AppError({
      code: "INVALID_EMAIL",
      title: "Invalid email",
      message: "Please enter a valid email address.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { email: "Please enter a valid email address." },
    });
  }
  return email;
};

const assertEmailAvailableForApproval = async (
  env: Env,
  context: AuthActor,
  userId: string,
  currentEmail: string | null | undefined,
  nextEmail: string,
) => {
  if (normalizeEmail(currentEmail ?? "") === nextEmail) {
    throw new AppError({
      code: "EMAIL_UNCHANGED",
      title: "Email unchanged",
      message: "The requested email is already the user's current email.",
      statusCode: 400,
      retryable: false,
      fieldErrors: { email: "The requested email is already the user's current email." },
    });
  }

  const existing = await repository.findUserByEmail(env, context.companyId, nextEmail);
  if (existing && existing.id !== userId) {
    throw new AppError({
      code: "DUPLICATE_USER_EMAIL",
      title: "Duplicate email",
      message: "A user with this email already exists.",
      statusCode: 409,
      retryable: false,
      fieldErrors: { email: "A user with this email already exists." },
    });
  }
};

const audit = async (
  env: Env,
  context: AuthActor,
  action: string,
  request: ProfileUpdateRequestRecord,
  oldValue?: unknown,
  newValue?: unknown,
  reason?: string,
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    module: "profile_update_requests",
    action,
    entityType: "user_profile_update_request",
    entityId: request.id,
    employeeId: request.employee_id ?? undefined,
    actorId: context.actorUserId,
    oldValueJson: oldValue === undefined ? undefined : JSON.stringify(oldValue),
    newValueJson: newValue === undefined ? undefined : JSON.stringify(newValue),
    reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};

const ensureRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("The requested profile update request could not be found.");
  assertAllowedRequestType(request.request_type);
  return request;
};

const ensurePending = (request: ProfileUpdateRequestRecord) => {
  if (request.status !== "pending") {
    throw new ConflictError("This profile update request has already been reviewed.");
  }
};

const ensureNotOwnReview = (context: AuthActor, request: ProfileUpdateRequestRecord) => {
  if (request.user_id === context.actorUserId && !context.isSuperAdmin) {
    throw new PermissionError("You cannot review your own profile update request.");
  }
};

const applyApprovedChange = async (
  env: Env,
  context: AuthActor,
  request: ProfileUpdateRequestRecord,
) => {
  const value = parseJson(request.requested_value_json);
  const user = await repository.findUser(env, context.companyId, request.user_id);
  const employee = request.employee_id
    ? await repository.findEmployee(env, context.companyId, request.employee_id)
    : null;

  const oldValue = { user, employee };
  let manualFollowUpRequired = false;

  switch (request.request_type) {
    case "name_update":
      await repository.updateUserFields(env, context.companyId, request.user_id, {
        full_name: String(value.full_name ?? value.name ?? ""),
      });
      if (request.employee_id) {
        await repository.updateEmployeeFields(env, context.companyId, request.employee_id, {
          full_name: value.full_name ?? value.name,
        });
      }
      break;
    case "phone_update":
      await repository.updateUserFields(env, context.companyId, request.user_id, {
        phone: String(value.phone ?? ""),
      });
      if (request.employee_id) {
        await repository.updateEmployeeFields(env, context.companyId, request.employee_id, {
          phone: value.phone,
        });
      }
      break;
    case "email_update":
      {
        const email = readEmailUpdate(value);
        await assertEmailAvailableForApproval(env, context, request.user_id, user?.email, email);
        await repository.updateUserFields(env, context.companyId, request.user_id, {
          email,
        });
        await repository.revokeUserSessions(env, context.companyId, request.user_id);
      }
      break;
    case "emergency_contact_update":
      if (request.employee_id) {
        await repository.updateEmployeeFields(env, context.companyId, request.employee_id, {
          emergency_contact_name: value.emergency_contact_name,
          emergency_contact_phone: value.emergency_contact_phone,
        });
      }
      break;
    case "id_card_update":
      if (request.employee_id) {
        await repository.updateEmployeeFields(env, context.companyId, request.employee_id, {
          id_card_number: value.id_card_number,
        });
      }
      break;
    case "passport_update":
      if (request.employee_id) {
        await repository.updateEmployeeFields(env, context.companyId, request.employee_id, {
          passport_number: value.passport_number,
        });
      }
      break;
    case "bank_info_update":
      if (request.employee_id) {
        await repository.updateEmployeeFields(env, context.companyId, request.employee_id, {
          bank_name: value.bank_name,
          bank_account_masked: value.bank_account_masked,
        });
      }
      break;
    case "document_update":
    case "visa_update":
    case "work_permit_update":
    case "profile_photo_update":
      if (request.employee_id && value.file_key && value.document_type) {
        await repository.createEmployeeDocumentMetadata(env, {
          id: createEntityId("doc"),
          companyId: context.companyId,
          employeeId: request.employee_id,
          documentType: String(value.document_type),
          fileKey: String(value.file_key),
          fileName: value.file_name ? String(value.file_name) : null,
          mimeType: value.mime_type ? String(value.mime_type) : null,
          uploadedBy: context.actorUserId,
        });
      } else {
        manualFollowUpRequired = true;
      }
      break;
    case "address_update":
      manualFollowUpRequired = true;
      break;
    default:
      if (!(ALLOWED_PROFILE_UPDATE_REQUEST_TYPES as readonly string[]).includes(request.request_type)) {
        throw new ValidationError("This type of profile update cannot be approved here.");
      }
  }

  return {
    oldValue,
    manualFollowUpRequired,
  };
};

export const listRequests = async (
  env: Env,
  context: AuthActor,
  filters: ProfileUpdateRequestFilters,
) => {
  const [total, rows] = await Promise.all([
    repository.countRequests(env, context.companyId, filters),
    repository.listRequests(env, context.companyId, filters),
  ]);
  const pagination: PaginationMeta = {
    page: filters.page,
    page_size: filters.page_size,
    total,
    total_pages: Math.ceil(total / filters.page_size),
  };
  return { rows, pagination };
};

export const getRequest = (env: Env, context: AuthActor, id: string) =>
  ensureRequest(env, context, id);

export const approveRequest = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: ReviewInput,
) => {
  const request = await ensureRequest(env, context, id);
  ensurePending(request);
  ensureNotOwnReview(context, request);
  const { oldValue, manualFollowUpRequired } = await applyApprovedChange(
    env,
    context,
    request,
  );
  const reviewInput = manualFollowUpRequired
    ? {
        ...input,
        review_notes: `${input.review_notes} Manual HR follow-up may be required for this update type.`,
      }
    : input;
  await repository.updateReviewStatus(
    env,
    context.companyId,
    id,
    "approved",
    context.actorUserId,
    reviewInput,
    JSON.stringify(oldValue),
  );
  await audit(env, context, "profile_update_request_approved", request, oldValue, {
    ...parseJson(request.requested_value_json),
    manual_follow_up_required: manualFollowUpRequired,
  }, input.reason);
  await broadcastEvent(env, {
    roomName: `company:${context.companyId}`,
    type: "profile_update_request.approved",
    payload: { request_id: id },
    triggeredBy: context.actorUserId,
  }).catch(() => undefined);
  return {
    approved: true,
    manual_follow_up_required: manualFollowUpRequired,
    message: manualFollowUpRequired
      ? "Profile update request approved. Manual HR follow-up may be required for this update type."
      : "Profile update request approved successfully.",
  };
};

export const rejectRequest = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: ReviewInput,
) => {
  const request = await ensureRequest(env, context, id);
  ensurePending(request);
  ensureNotOwnReview(context, request);
  await repository.updateReviewStatus(env, context.companyId, id, "rejected", context.actorUserId, input);
  await audit(env, context, "profile_update_request_rejected", request, undefined, undefined, input.reason);
  await broadcastEvent(env, {
    roomName: `company:${context.companyId}`,
    type: "profile_update_request.rejected",
    payload: { request_id: id },
    triggeredBy: context.actorUserId,
  }).catch(() => undefined);
  return { rejected: true };
};

export const returnForMoreInfo = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: ReviewInput,
) => {
  const request = await ensureRequest(env, context, id);
  ensurePending(request);
  ensureNotOwnReview(context, request);
  await repository.updateReviewStatus(env, context.companyId, id, "returned_for_more_info", context.actorUserId, input);
  await audit(env, context, "profile_update_request_returned", request, undefined, undefined, input.reason);
  return { returned: true };
};
