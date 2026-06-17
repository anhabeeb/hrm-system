import { z } from "zod";

export const exportCreateSchema = z.object({
  export_type: z.string().min(1),
  format: z.enum(["xlsx", "pdf"]),
  reason: z.string().optional(),
});

export const importUploadSchema = z.object({
  import_type: z.string().min(1),
  file_name: z.string().min(1),
  mime_type: z.string().min(1),
  content_base64: z.string().min(1),
  reason: z.string().min(3),
});
