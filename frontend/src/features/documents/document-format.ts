import { maskSensitiveFileName } from "./document-sanitize";
import type { DocumentRecord } from "./documents.types";

const formatDocumentDate = (value?: string | null) => {
  if (!value) return "Not available";
  return value.slice(0, 10);
};

export const documentTypeOptions = [
  { value: "passport", label: "Passport" },
  { value: "national_id", label: "National ID" },
  { value: "work_visa", label: "Work Visa" },
  { value: "work_permit", label: "Work Permit" },
  { value: "medical_certificate", label: "Medical Certificate" },
  { value: "insurance", label: "Insurance" },
  { value: "driving_license", label: "Driving License" },
  { value: "other", label: "Other" },
];

export const documentStatusOptions = [
  { value: "active", label: "Active" },
  { value: "expiring_soon", label: "Expiring Soon" },
  { value: "expired", label: "Expired" },
  { value: "no_expiry", label: "No Expiry" },
  { value: "replaced", label: "Replaced" },
  { value: "archived", label: "Archived" },
  { value: "pending_review", label: "Pending Review" },
  { value: "rejected", label: "Rejected" },
];

export const drivingLicenseCategoryOptions = [
  { value: "motorcycle", label: "Motorcycle" },
  { value: "light_vehicle", label: "Light Vehicle" },
  { value: "heavy_vehicle", label: "Heavy Vehicle" },
  { value: "boat", label: "Boat" },
  { value: "other", label: "Other" },
];

export const labelFromOptions = (value: string | null | undefined, options: Array<{ value: string; label: string }>) =>
  options.find((option) => option.value === value)?.label ?? value?.replace(/_/g, " ") ?? "-";

export const documentTypeLabel = (document: Pick<DocumentRecord, "document_type" | "driving_license_category" | "driving_license_category_other">) => {
  const base = labelFromOptions(document.document_type, documentTypeOptions);
  if (document.document_type !== "driving_license") return base;
  const category = document.driving_license_category === "other"
    ? document.driving_license_category_other ?? "Other"
    : labelFromOptions(document.driving_license_category, drivingLicenseCategoryOptions);
  return category && category !== "-" ? `${base} - ${category}` : base;
};

export const documentName = (document: DocumentRecord, canViewSensitive: boolean) =>
  maskSensitiveFileName(document.file_name, document.is_sensitive, canViewSensitive);

export const documentExpiry = (document: DocumentRecord) => formatDocumentDate(document.expiry_date);
