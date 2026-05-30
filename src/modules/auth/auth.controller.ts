import type { Context } from "hono";

import * as authService from "./auth.service";
import {
  validateBackupCodeInput,
  validateChangePasswordInput,
  validateForgotPasswordInput,
  validateKycUpdateRequestInput,
  validateLoginInput,
  validateResetPasswordInput,
  validateTwoFactorDisableInput,
  validateTwoFactorVerifyInput,
} from "./auth.validators";
import type { AppContext } from "../../types/api.types";
import { AuthError } from "../../utils/errors";
import { ok } from "../../utils/response";

const readJson = async (c: Context<AppContext>): Promise<unknown> =>
  c.req.json().catch(() => ({}));

const requestContext = (c: Context<AppContext>) => ({
  requestId: c.get("requestId"),
  ipAddress:
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for") ??
    null,
  userAgent: c.req.header("user-agent") ?? null,
  deviceId: c.req.header("x-device-id") ?? null,
});

const requireActor = (c: Context<AppContext>) => {
  const actor = c.get("authUser");

  if (!actor) {
    throw new AuthError("Please sign in to continue.");
  }

  return actor;
};

const requireSessionId = (c: Context<AppContext>): string | undefined =>
  c.get("authSession")?.id;

const respondWithCookie = (
  c: Context<AppContext>,
  result: { response: unknown; message: string; cookie?: string },
) => {
  const response = ok(result.response, result.message, {
    requestId: c.get("requestId"),
  });

  if (result.cookie) {
    response.headers.append("set-cookie", result.cookie);
  }

  return response;
};

export const login = async (c: Context<AppContext>) => {
  const input = validateLoginInput(await readJson(c));
  const result = await authService.login(c.env, input, requestContext(c));

  return respondWithCookie(c, result);
};

export const logout = async (c: Context<AppContext>) => {
  const actor = requireActor(c);
  const user = await authService.loadUserRecord(c.env, actor.actorUserId);
  const sessionId = requireSessionId(c);

  if (!sessionId) {
    throw new AuthError("Your session has expired. Please log in again.");
  }

  const result = await authService.logout(c.env, user, sessionId, requestContext(c));

  return respondWithCookie(c, result);
};

export const authMe = async (c: Context<AppContext>) => {
  const actor = requireActor(c);
  return ok(await authService.getMe(c.env, actor.actorUserId), "Profile loaded.", {
    requestId: c.get("requestId"),
  });
};

export const forgotPassword = async (c: Context<AppContext>) => {
  const input = validateForgotPasswordInput(await readJson(c));
  const result = await authService.forgotPassword(c.env, input, requestContext(c));

  return ok(result.response, result.message, {
    requestId: c.get("requestId"),
  });
};

export const resetPassword = async (c: Context<AppContext>) => {
  const input = validateResetPasswordInput(await readJson(c));
  const result = await authService.resetPassword(c.env, input, requestContext(c));

  return ok(result.response, result.message, {
    requestId: c.get("requestId"),
  });
};

export const changePassword = async (c: Context<AppContext>) => {
  const actor = requireActor(c);
  const input = validateChangePasswordInput(await readJson(c));
  const result = await authService.changePassword(
    c.env,
    actor.actorUserId,
    requireSessionId(c),
    input,
    requestContext(c),
  );

  return ok(result.response, result.message, {
    requestId: c.get("requestId"),
  });
};

export const setupTwoFactor = async (c: Context<AppContext>) => {
  const actor = requireActor(c);
  const result = await authService.setupTwoFactor(
    c.env,
    actor.actorUserId,
    requestContext(c),
  );

  return ok(result.response, result.message, {
    requestId: c.get("requestId"),
  });
};

export const verifyTwoFactor = async (c: Context<AppContext>) => {
  const actor = requireActor(c);
  const input = validateTwoFactorVerifyInput(await readJson(c));
  const result = await authService.verifyTwoFactor(
    c.env,
    actor.actorUserId,
    input,
    requestContext(c),
  );

  return ok(result.response, result.message, {
    requestId: c.get("requestId"),
  });
};

export const disableTwoFactor = async (c: Context<AppContext>) => {
  const actor = requireActor(c);
  const input = validateTwoFactorDisableInput(await readJson(c));
  const result = await authService.disableTwoFactor(
    c.env,
    actor.actorUserId,
    input,
    requestContext(c),
  );

  return ok(result.response, result.message, {
    requestId: c.get("requestId"),
  });
};

export const useBackupCode = async (c: Context<AppContext>) => {
  const actor = requireActor(c);
  const input = validateBackupCodeInput(await readJson(c));
  const result = await authService.useBackupCode(
    c.env,
    actor.actorUserId,
    input,
    requestContext(c),
  );

  return ok(result.response, result.message, {
    requestId: c.get("requestId"),
  });
};

export const myProfile = authMe;

export const mySecurity = async (c: Context<AppContext>) => {
  const actor = requireActor(c);

  return ok(
    await authService.getSecuritySummary(c.env, actor.actorUserId),
    "Security details loaded.",
    {
      requestId: c.get("requestId"),
    },
  );
};

export const listKycRequests = async (c: Context<AppContext>) => {
  const actor = requireActor(c);

  return ok(
    await authService.listOwnKycRequests(c.env, actor.actorUserId),
    "Update requests loaded.",
    {
      requestId: c.get("requestId"),
    },
  );
};

export const createKycRequest = async (c: Context<AppContext>) => {
  const actor = requireActor(c);
  const input = validateKycUpdateRequestInput(await readJson(c));
  const result = await authService.createKycRequest(
    c.env,
    actor.actorUserId,
    input,
    requestContext(c),
  );

  return ok(result.response, result.message, {
    requestId: c.get("requestId"),
  });
};

export const getKycRequest = async (c: Context<AppContext>) => {
  const actor = requireActor(c);
  const requestId = c.req.param("id");

  if (!requestId) {
    throw new AuthError("The requested update request could not be found.");
  }

  return ok(
    await authService.getOwnKycRequest(c.env, actor.actorUserId, requestId),
    "Update request loaded.",
    {
      requestId: c.get("requestId"),
    },
  );
};
