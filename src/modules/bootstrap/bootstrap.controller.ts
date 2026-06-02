import type { Context } from "hono";

import type { AppContext } from "../../types/api.types";
import { created, ok } from "../../utils/response";

import { BOOTSTRAP_MESSAGES } from "./bootstrap.constants";
import * as service from "./bootstrap.service";
import { validateBootstrapInitialize } from "./bootstrap.validators";

const requestId = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const json = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));

export const status = async (c: Context<AppContext>) => {
  const data = await service.getBootstrapStatus(c.env);
  return ok(
    data,
    data.setup_required ? BOOTSTRAP_MESSAGES.required : BOOTSTRAP_MESSAGES.completed,
    requestId(c),
  );
};

export const initialize = async (c: Context<AppContext>) =>
  created(
    await service.initializeBootstrap(
      c.env,
      validateBootstrapInitialize(await json(c)),
      c.req.header("authorization"),
    ),
    BOOTSTRAP_MESSAGES.success,
    requestId(c),
  );
