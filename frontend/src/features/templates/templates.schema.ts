import { z } from "zod";

export const templatePlaceholderSchema = z.object({
  id: z.string(),
  template_name: z.string(),
  category: z.string(),
  format: z.string(),
  status: z.string(),
  description: z.string(),
});
