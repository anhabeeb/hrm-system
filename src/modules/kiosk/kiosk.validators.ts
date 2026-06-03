import { z } from "zod";

import { KIOSK_ATTENDANCE_METHODS } from "./kiosk.constants";
import type { KioskClockInput, KioskEmployeeFilters } from "./kiosk.types";
import { ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

export const validateKioskEmployeeFilters = (
  query: Record<string, string | undefined>,
): KioskEmployeeFilters =>
  parse(
    z.object({
      search: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(50),
    }),
    query,
  );

export const validateKioskClockInput = (payload: unknown): KioskClockInput =>
  parse(
    z.object({
      employee_id: z.string().trim().min(1, "Employee is required."),
      event_time: z.string().trim().optional(),
      attendance_method: z.enum(KIOSK_ATTENDANCE_METHODS).default("kiosk"),
      local_id: z.string().trim().optional(),
    }),
    payload,
  );
