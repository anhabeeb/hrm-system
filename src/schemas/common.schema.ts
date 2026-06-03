import { z } from "zod";

import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../config/constants";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  page_size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(100).optional(),
});

export const idParamSchema = z.object({
  id: z.string().trim().min(1, "A record identifier is required."),
});

export const dateRangeSchema = z.object({
  start_date: z.string().trim().min(1).optional(),
  end_date: z.string().trim().min(1).optional(),
});
