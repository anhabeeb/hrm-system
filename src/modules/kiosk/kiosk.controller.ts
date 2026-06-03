import type { Context } from "hono";

import * as service from "./kiosk.service";
import { validateKioskClockInput, validateKioskEmployeeFilters } from "./kiosk.validators";
import type { AppContext, DeviceAuthContext } from "../../types/api.types";
import { DeviceAuthError } from "../../utils/errors";
import { ok, paginated } from "../../utils/response";

const device = (c: Context<AppContext>): DeviceAuthContext => {
  const context = c.get("deviceAuth");
  if (!context) throw new DeviceAuthError("Device authentication is required.");
  return context;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));

const kioskClockMessage = (
  result: Record<string, unknown>,
  successMessage: string,
): string => {
  if (!result.conflict_created) return successMessage;

  if (result.conflict_type === "wrong_outlet") {
    return "This employee is not assigned to this outlet. A conflict has been created for review.";
  }

  if (result.conflict_type === "missing_clock_in") {
    return "A missing clock-in conflict has been created for review.";
  }

  if (result.conflict_type === "duplicate_punch") {
    return "This attendance record already exists. A conflict has been created for review.";
  }

  return "This attendance record needs review. A conflict has been created.";
};

export const status = async (c: Context<AppContext>) =>
  ok(await service.getStatus(c.env, device(c)), "Kiosk status loaded successfully.", { requestId: c.get("requestId") });

export const employees = async (c: Context<AppContext>) => {
  const result = await service.listEmployees(
    c.env,
    device(c),
    validateKioskEmployeeFilters({
      search: c.req.query("search"),
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
    }),
  );
  return paginated(result.rows, result.pagination, "Kiosk employee list loaded successfully.", { requestId: c.get("requestId") });
};

export const clockIn = async (c: Context<AppContext>) =>
  {
    const result = await service.clockIn(
      c.env,
      device(c),
      validateKioskClockInput(await body(c)),
    );
    return ok(
      result,
      kioskClockMessage(result, "Clock-in recorded successfully."),
      { requestId: c.get("requestId") },
    );
  };

export const clockOut = async (c: Context<AppContext>) =>
  {
    const result = await service.clockOut(
      c.env,
      device(c),
      validateKioskClockInput(await body(c)),
    );
    return ok(
      result,
      kioskClockMessage(result, "Clock-out recorded successfully."),
      { requestId: c.get("requestId") },
    );
  };

export const today = async (c: Context<AppContext>) =>
  ok({ records: await service.today(c.env, device(c)) }, "Kiosk attendance loaded successfully.", { requestId: c.get("requestId") });

export const deviceSummary = async (c: Context<AppContext>) =>
  ok(await service.deviceSummary(c.env, device(c)), "Kiosk device summary loaded successfully.", { requestId: c.get("requestId") });
