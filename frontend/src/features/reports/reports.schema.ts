import { z } from "zod";

export const reportGenerateSchema = z.object({
  report_key: z.string().min(1, "Please select a report."),
  format: z.enum(["xlsx", "pdf"]).default("xlsx"),
  filters: z.record(z.unknown()).default({}),
});
