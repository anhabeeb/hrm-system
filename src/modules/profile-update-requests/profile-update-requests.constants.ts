export const PROFILE_UPDATE_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "returned_for_more_info",
] as const;

export const ALLOWED_PROFILE_UPDATE_REQUEST_TYPES = [
  "name_update",
  "phone_update",
  "email_update",
  "address_update",
  "emergency_contact_update",
  "id_card_update",
  "passport_update",
  "visa_update",
  "work_permit_update",
  "bank_info_update",
  "profile_photo_update",
  "document_update",
] as const;

export const BLOCKED_PROFILE_UPDATE_REQUEST_TYPES = [
  "role",
  "permission",
  "outlet_access",
  "salary",
  "payroll",
  "attendance",
] as const;
