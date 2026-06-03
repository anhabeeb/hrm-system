import type { Context } from "hono";

import type { AppContext } from "../../types/api.types";
import { classifyError } from "../../utils/error-classifier";
import { logAppError } from "../../utils/error-logger";
import { appErrorResponse } from "../../utils/response";
import { created, ok } from "../../utils/response";
import { getCorsHeaders } from "../../middleware/cors.middleware";

import { BOOTSTRAP_MESSAGES } from "./bootstrap.constants";
import * as service from "./bootstrap.service";
import { validateBootstrapInitialize } from "./bootstrap.validators";

const requestId = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const json = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));

const isDevelopment = (env: Env): boolean =>
  env.ENVIRONMENT === "development" || env.ENVIRONMENT === "local" || env.ENVIRONMENT === "test";

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const errorStack = (error: unknown): string | undefined =>
  error instanceof Error ? error.stack : undefined;

const logSetupFailure = (
  requestIdValue: string,
  step: string,
  error: unknown,
) => {
  console.error("Setup initialization failed", {
    requestId: requestIdValue,
    route: "POST /api/v1/bootstrap/initialize",
    step,
    error_message: errorMessage(error),
    error_stack: errorStack(error),
  });
};

const bootstrapErrorResponse = (
  c: Context<AppContext>,
  step: string,
  error: unknown,
) => {
  const requestIdValue = c.get("requestId");
  const appError = classifyError(error, {
    requestId: requestIdValue,
    route: c.req.path,
    method: c.req.method,
    step,
  });

  logSetupFailure(requestIdValue, step, error);
  void logAppError(c, appError, error);

  if (isDevelopment(c.env) && !appError.details) {
    appError.details = {
      step,
      message: errorMessage(error),
      stack: errorStack(error),
    };
  }

  return appErrorResponse(appError, {
    headers: getCorsHeaders(c.req.header("origin"), c.env),
    requestId: requestIdValue,
    route: c.req.path,
    method: c.req.method,
    step,
  });
};

export const runBestEffortSetupSideEffects = async (input: {
  requestId: string;
  data: unknown;
  hooks?: Array<() => Promise<void> | void>;
}) => {
  // Setup post-success hooks intentionally stay best-effort. Future activity,
  // event, or realtime integrations must not turn a completed setup into a 500.
  void input.data;

  for (const hook of input.hooks ?? []) {
    try {
      await hook();
    } catch (error) {
      console.warn("Setup post-success side effect failed", {
        requestId: input.requestId,
        route: "POST /api/v1/bootstrap/initialize",
        step: "post_success_side_effects",
        error_message: errorMessage(error),
        error_stack: errorStack(error),
      });
    }
  }
};

export const status = async (c: Context<AppContext>) => {
  const data = await service.getBootstrapStatus(c.env);
  return ok(
    data,
    data.setup_required ? BOOTSTRAP_MESSAGES.required : BOOTSTRAP_MESSAGES.completed,
    requestId(c),
  );
};

export const initialize = async (c: Context<AppContext>) => {
  let step = "parse_payload";

  try {
    const payload = await json(c);
    step = "validate_payload";
    const input = validateBootstrapInitialize(payload);
    step = "initialize_system";
    const data = await service.initializeBootstrap(
      c.env,
      input,
      c.req.header("authorization"),
    );

    step = "post_success_side_effects";
    await runBestEffortSetupSideEffects({
      requestId: c.get("requestId"),
      data,
    });

    return created(data, BOOTSTRAP_MESSAGES.success, requestId(c));
  } catch (error) {
    return bootstrapErrorResponse(c, step, error);
  }
};
