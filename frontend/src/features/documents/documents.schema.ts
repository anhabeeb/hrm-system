import { z } from "zod";

export const documentUploadSchema = z.object({
  employee_id: z.string().trim().min(1, "Employee is required."),
  document_type: z.string().trim().min(1, "Document type is required."),
  file_name: z.string().trim().min(1, "File name is required."),
  mime_type: z.string().trim().min(1, "File type is required."),
  content_base64: z.string().trim().min(1, "Please attach a document file."),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry date must use YYYY-MM-DD.").optional().or(z.literal("")),
  is_sensitive: z.boolean().optional(),
});

export const documentUpdateSchema = z.object({
  document_type: z.string().trim().optional(),
  file_name: z.string().trim().optional(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry date must use YYYY-MM-DD.").optional().or(z.literal("")),
  status: z.string().trim().optional(),
  is_sensitive: z.boolean().optional(),
  reason: z.string().trim().optional(),
});
