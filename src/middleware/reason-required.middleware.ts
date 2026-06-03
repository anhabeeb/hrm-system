import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import type { AppContext } from "../types/api.types";
import { ReasonRequiredError } from "../utils/errors";

export interface ReasonRequiredOptions {
  fields?: string[];
  minLength?: number;
}

const defaultReasonFields = ["reason", "change_reason", "notes"];

const readReason = async (
  c: Context<AppContext>,
  fields: string[],
): Promise<string | null> => {
  const body = await c.req.raw
    .clone()
    .json<Record<string, unknown>>()
    .catch((): Record<string, unknown> => ({}));

  for (const field of fields) {
    const value = body[field];

    if (typeof value === "string") {
      return value.trim();
    }
  }

  return null;
};

export const requireReason = (options: ReasonRequiredOptions = {}) =>
  createMiddleware<AppContext>(async (c, next) => {
    const minLength = options.minLength ?? 3;
    const reason = await readReason(c, options.fields ?? defaultReasonFields);

    if (!reason || reason.length < minLength) {
      throw new ReasonRequiredError();
    }

    await next();
  });
