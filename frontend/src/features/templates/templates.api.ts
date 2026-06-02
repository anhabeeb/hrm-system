import type { TemplatePlaceholder } from "./templates.types";

export const templatePlaceholders: TemplatePlaceholder[] = [
  { id: "payslip_pdf", template_name: "Payslip PDF template", category: "Payroll", format: "PDF", status: "placeholder", description: "Real PDF rendering will be connected in a future prompt." },
  { id: "asset_handover", template_name: "Asset handover form", category: "Assets", format: "PDF", status: "placeholder", description: "Template editing is not connected until backend endpoints exist." },
  { id: "document_expiry", template_name: "Document expiry report template", category: "Documents", format: "Report", status: "placeholder", description: "Export formatting is future work." },
];

export const notificationTemplatePlaceholders: TemplatePlaceholder[] = [
  { id: "password_reset", template_name: "Password reset email", category: "Security", format: "Email", status: "placeholder", description: "External provider integration will be connected in a future prompt." },
  { id: "leave_approved", template_name: "Leave approved notification", category: "Leave", format: "Email", status: "placeholder", description: "No send action is available without backend/provider support." },
  { id: "device_warning", template_name: "Device sync warning", category: "Devices", format: "Notification", status: "placeholder", description: "Provider API keys are never exposed in the frontend." },
];
