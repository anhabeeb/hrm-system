import { z } from "zod";

export const reportGenerateSchema = z.object({
  report_key: z.string().min(1, "Please select a report."),
  format: z.enum(["json", "csv", "xlsx", "pdf"]).default("json"),
  filters: z.record(z.unknown()).default({}),
});
