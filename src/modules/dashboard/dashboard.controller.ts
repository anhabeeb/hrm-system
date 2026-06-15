import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError } from "../../utils/errors";
import { ok } from "../../utils/response";
import * as service from "./dashboard.service";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const withGeneratedAt = <T extends { data: unknown; meta?: { generated_at?: string } }>(result: T) => ({
  ...result,
  generated_at: result.meta?.generated_at ?? new Date().toISOString(),
});

export const summary = async (c: Context<AppContext>) =>
  ok(withGeneratedAt(await service.getSummary(c.env, actor(c))), "Dashboard summary loaded successfully.", {
    requestId: c.get("requestId"),
  });

export const attention = async (c: Context<AppContext>) =>
  ok(withGeneratedAt(await service.getAttention(c.env, actor(c))), "Dashboard attention items loaded successfully.", {
    requestId: c.get("requestId"),
  });

export const attendanceToday = async (c: Context<AppContext>) =>
  ok(withGeneratedAt(await service.getSection(c.env, actor(c), "attendance")), "Attendance dashboard loaded successfully.", {
    requestId: c.get("requestId"),
  });

export const approvals = async (c: Context<AppContext>) =>
  ok(withGeneratedAt(await service.getSection(c.env, actor(c), "approvals")), "Approval dashboard loaded successfully.", {
    requestId: c.get("requestId"),
  });

export const expiryAlerts = async (c: Context<AppContext>) =>
  ok(withGeneratedAt(await service.getSection(c.env, actor(c), "expiry-alerts")), "Expiry alert dashboard loaded successfully.", {
    requestId: c.get("requestId"),
  });

export const deviceHealth = async (c: Context<AppContext>) =>
  ok(withGeneratedAt(await service.getSection(c.env, actor(c), "device-health")), "Device health dashboard loaded successfully.", {
    requestId: c.get("requestId"),
  });

export const payrollReadiness = async (c: Context<AppContext>) =>
  ok(withGeneratedAt(await service.getSection(c.env, actor(c), "payroll-readiness")), "Payroll readiness dashboard loaded successfully.", {
    requestId: c.get("requestId"),
  });

export const quickActions = async (c: Context<AppContext>) =>
  ok(withGeneratedAt(await service.getQuickActionsForEnabledModules(c.env, actor(c))), "Dashboard quick actions loaded successfully.", {
    requestId: c.get("requestId"),
  });
