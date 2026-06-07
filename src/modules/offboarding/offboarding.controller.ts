import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";
import * as service from "./offboarding.service";
import {
  validateOffboardingActionInput,
  validateOffboardingListFilters,
  validateOffboardingStartInput,
  validateOffboardingUpdateInput,
} from "./offboarding.validators";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const readJson = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));

const employeeId = (c: Context<AppContext>) => {
  const id = c.req.param("id") || c.req.param("employeeId");
  if (!id) throw new ValidationError("Employee is required.");
  return id;
};

const caseId = (c: Context<AppContext>) => {
  const id = c.req.param("caseId");
  if (!id) throw new ValidationError("Offboarding case is required.");
  return id;
};

const taskId = (c: Context<AppContext>) => {
  const id = c.req.param("taskId");
  if (!id) throw new ValidationError("Offboarding task is required.");
  return id;
};

export const listCases = async (c: Context<AppContext>) => {
  const result = await service.listCases(
    c.env,
    actor(c),
    validateOffboardingListFilters({
      status: c.req.query("status"),
      offboarding_type: c.req.query("offboarding_type"),
      outlet_id: c.req.query("outlet_id"),
      department_id: c.req.query("department_id"),
      employee_id: c.req.query("employee_id"),
      date_from: c.req.query("date_from"),
      date_to: c.req.query("date_to"),
      page: c.req.query("page"),
      page_size: c.req.query("page_size"),
    }),
  );
  return paginated(result.rows, result.pagination, "Offboarding cases loaded successfully.", { requestId: c.get("requestId") });
};

export const listEmployeeOffboarding = async (c: Context<AppContext>) =>
  ok(
    await service.listEmployeeOffboarding(c.env, actor(c), employeeId(c)),
    "Employee offboarding loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const startCase = async (c: Context<AppContext>) =>
  created(
    await service.startCase(c.env, actor(c), employeeId(c), validateOffboardingStartInput(await readJson(c))),
    "Offboarding started successfully.",
    { requestId: c.get("requestId") },
  );

export const getCase = async (c: Context<AppContext>) =>
  ok(
    await service.getCase(c.env, actor(c), employeeId(c), caseId(c)),
    "Offboarding case loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const updateCase = async (c: Context<AppContext>) =>
  ok(
    await service.updateCase(c.env, actor(c), employeeId(c), caseId(c), validateOffboardingUpdateInput(await readJson(c))),
    "Offboarding case updated successfully.",
    { requestId: c.get("requestId") },
  );

export const completeTask = async (c: Context<AppContext>) =>
  ok(
    await service.completeTask(c.env, actor(c), employeeId(c), caseId(c), taskId(c), validateOffboardingActionInput(await readJson(c), false)),
    "Offboarding task completed successfully.",
    { requestId: c.get("requestId") },
  );

export const waiveTask = async (c: Context<AppContext>) =>
  ok(
    await service.waiveTask(c.env, actor(c), employeeId(c), caseId(c), taskId(c), validateOffboardingActionInput(await readJson(c), true)),
    "Offboarding task waived successfully.",
    { requestId: c.get("requestId") },
  );

export const cancelCase = async (c: Context<AppContext>) =>
  ok(
    await service.cancelCase(c.env, actor(c), employeeId(c), caseId(c), validateOffboardingActionInput(await readJson(c), true)),
    "Offboarding case cancelled.",
    { requestId: c.get("requestId") },
  );

export const prepareFinalSettlement = async (c: Context<AppContext>) =>
  ok(
    await service.prepareFinalSettlement(c.env, actor(c), employeeId(c), caseId(c), validateOffboardingActionInput(await readJson(c), false)),
    "Final settlement draft prepared successfully.",
    { requestId: c.get("requestId") },
  );

export const markReady = async (c: Context<AppContext>) =>
  ok(
    await service.markReady(c.env, actor(c), employeeId(c), caseId(c), validateOffboardingActionInput(await readJson(c), false)),
    "Offboarding marked ready for final settlement.",
    { requestId: c.get("requestId") },
  );

export const completeCase = async (c: Context<AppContext>) =>
  ok(
    await service.completeCase(c.env, actor(c), employeeId(c), caseId(c), validateOffboardingActionInput(await readJson(c), true)),
    "Offboarding completed successfully.",
    { requestId: c.get("requestId") },
  );
