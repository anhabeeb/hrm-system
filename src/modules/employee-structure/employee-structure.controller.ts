import type { Context } from "hono";

import * as service from "./employee-structure.service";
import {
  validateEmployeeStructureInput,
  validateLevelRoleTemplateFilters,
  validateLevelRoleTemplateInput,
  validateLevelRoleTemplateUpdateInput,
} from "./employee-structure.validators";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const id = (c: Context<AppContext>, name = "id") => {
  const value = c.req.param(name);
  if (!value) throw new ValidationError("A valid record is required.");
  return value;
};

export const listAccessLevels = async (c: Context<AppContext>) =>
  ok({ levels: await service.listAccessLevels(c.env, actor(c)) }, "Access levels loaded successfully.", { requestId: c.get("requestId") });

export const listLevelRoleTemplates = async (c: Context<AppContext>) => {
  const result = await service.listLevelRoleTemplates(c.env, actor(c), validateLevelRoleTemplateFilters({
    level: c.req.query("level"),
    department_id: c.req.query("department_id"),
    position_id: c.req.query("position_id"),
    role_id: c.req.query("role_id"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
  }));
  return paginated(result.rows, result.pagination, "Level role templates loaded successfully.", { requestId: c.get("requestId") });
};

export const createLevelRoleTemplate = async (c: Context<AppContext>) =>
  created(await service.createLevelRoleTemplate(c.env, actor(c), validateLevelRoleTemplateInput(await body(c))), "Level role template created successfully.", { requestId: c.get("requestId") });

export const updateLevelRoleTemplate = async (c: Context<AppContext>) =>
  ok(await service.updateLevelRoleTemplate(c.env, actor(c), id(c), validateLevelRoleTemplateUpdateInput(await body(c))), "Level role template updated successfully.", { requestId: c.get("requestId") });

export const archiveLevelRoleTemplate = async (c: Context<AppContext>) =>
  ok(await service.archiveLevelRoleTemplate(c.env, actor(c), id(c)), "Level role template archived successfully.", { requestId: c.get("requestId") });

export const getEmployeeStructure = async (c: Context<AppContext>) =>
  ok(await service.getEmployeeStructure(c.env, actor(c), id(c)), "Employee structure loaded successfully.", { requestId: c.get("requestId") });

export const updateEmployeeStructure = async (c: Context<AppContext>) =>
  ok(await service.updateEmployeeStructure(c.env, actor(c), id(c), validateEmployeeStructureInput(await body(c))), "Employee structure updated successfully.", { requestId: c.get("requestId") });

export const listEmployeeStructureHistory = async (c: Context<AppContext>) =>
  ok(await service.listEmployeeStructureHistory(c.env, actor(c), id(c)), "Employee structure history loaded successfully.", { requestId: c.get("requestId") });

export const applyLevelRoleTemplate = async (c: Context<AppContext>) =>
  ok(await service.applyLevelRoleTemplate(c.env, actor(c), id(c)), "Level role template applied successfully.", { requestId: c.get("requestId") });
