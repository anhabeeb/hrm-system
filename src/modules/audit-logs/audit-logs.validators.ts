import { z } from "zod";

import type { AuditLogFilters } from "./audit-logs.types";
import { ValidationError } from "../../utils/errors";

const id = z.string().trim().regex(/^[A-Za-z0-9_.:-]+$/, "Please choose a valid audit log.");

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Please review the audit log filters.");
  }
  return result.data;
};

export const validateAuditLogId = (value: string) => parse(id, value);

export const validateAuditLogFilters = (query: Record<string, string | undefined>): AuditLogFilters =>
  parse(
    z.object({
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      actor_user_id: z.string().optional(),
      module: z.string().optional(),
      action: z.string().optional(),
      entity_type: z.string().optional(),
      entity_id: z.string().optional(),
      request_id: z.string().optional(),
      severity: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
    }),
    query,
  );
