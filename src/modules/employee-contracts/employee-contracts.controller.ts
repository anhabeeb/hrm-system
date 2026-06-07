import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { AuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";
import * as service from "./employee-contracts.service";
import {
  validateContractActionInput,
  validateContractCreateInput,
  validateContractListFilters,
  validateContractRenewInput,
  validateContractUpdateInput,
} from "./employee-contracts.validators";

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
const contractId = (c: Context<AppContext>) => {
  const id = c.req.param("contractId");
  if (!id) throw new ValidationError("Contract is required.");
  return id;
};

export const listEmployeeContracts = async (c: Context<AppContext>) =>
  ok(await service.listEmployeeContracts(c.env, actor(c), employeeId(c)), "Employee contracts loaded successfully.", { requestId: c.get("requestId") });

export const listContracts = async (c: Context<AppContext>) => {
  const result = await service.listContracts(c.env, actor(c), validateContractListFilters({
    employee_id: c.req.query("employee_id") || c.req.query("employee"),
    outlet_id: c.req.query("outlet_id") || c.req.query("outlet"),
    department_id: c.req.query("department_id") || c.req.query("department"),
    position_id: c.req.query("position_id") || c.req.query("position"),
    contract_type: c.req.query("contract_type"),
    contract_status: c.req.query("contract_status") || c.req.query("status"),
    expiring_within_days: c.req.query("expiring_within_days"),
    expired: c.req.query("expired"),
    date_from: c.req.query("date_from"),
    date_to: c.req.query("date_to"),
    search: c.req.query("search"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
  }));
  return paginated(result.rows, result.pagination, "Employee contracts loaded successfully.", { requestId: c.get("requestId") });
};

export const getContract = async (c: Context<AppContext>) =>
  ok(await service.getContract(c.env, actor(c), employeeId(c), contractId(c)), "Employee contract loaded successfully.", { requestId: c.get("requestId") });

export const createContract = async (c: Context<AppContext>) =>
  created(await service.createContract(c.env, actor(c), employeeId(c), validateContractCreateInput(await readJson(c))), "Employee contract created successfully.", { requestId: c.get("requestId") });

export const updateContract = async (c: Context<AppContext>) =>
  ok(await service.updateContract(c.env, actor(c), employeeId(c), contractId(c), validateContractUpdateInput(await readJson(c))), "Employee contract updated successfully.", { requestId: c.get("requestId") });

export const renewContract = async (c: Context<AppContext>) =>
  created(await service.renewContract(c.env, actor(c), employeeId(c), contractId(c), validateContractRenewInput(await readJson(c))), "Employee contract renewed successfully.", { requestId: c.get("requestId") });

export const archiveContract = async (c: Context<AppContext>) =>
  ok(await service.archiveContract(c.env, actor(c), employeeId(c), contractId(c), validateContractActionInput(await readJson(c))), "Employee contract archived successfully.", { requestId: c.get("requestId") });

export const contractHistory = async (c: Context<AppContext>) =>
  ok(await service.getContractHistory(c.env, actor(c), employeeId(c), contractId(c)), "Employee contract history loaded successfully.", { requestId: c.get("requestId") });
