import { z } from "zod";

import { OUTLET_SORT_FIELDS, OUTLET_STATUSES } from "./outlets.constants";
import type { OutletFilters, OutletWriteInput } from "./outlets.types";
import { ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

const writeSchema = z.object({
  name: z.string().trim().min(1, "Outlet name is required."),
  code: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  manager_user_id: z.string().trim().nullable().optional(),
  gps_lat: z.number().nullable().optional(),
  gps_lng: z.number().nullable().optional(),
  status: z.enum(OUTLET_STATUSES).default("active"),
});

export const validateOutletFilters = (
  query: Record<string, string | undefined>,
): OutletFilters =>
  parse(
    z.object({
      search: z.string().trim().optional(),
      status: z.enum(OUTLET_STATUSES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
      sort_by: z.enum(OUTLET_SORT_FIELDS).default("created_at"),
      sort_direction: z.enum(["asc", "desc"]).default("desc"),
    }),
    query,
  );

export const validateOutletCreateInput = (payload: unknown): OutletWriteInput =>
  parse(writeSchema, payload);

export const validateOutletUpdateInput = (payload: unknown): Partial<OutletWriteInput> =>
  parse(writeSchema.partial(), payload);
