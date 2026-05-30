import type { OutletFilters, OutletRecord, OutletWriteInput } from "./outlets.types";
import * as outletsRepository from "./outlets.repository";
import { createAuditLog } from "../../services/audit.service";
import { broadcastEvent } from "../../services/realtime.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const audit = async (
  env: Env,
  context: AuthActor,
  action: string,
  entityId: string,
  oldValue?: unknown,
  newValue?: unknown,
  reason?: string,
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    module: "outlets",
    action,
    entityType: "outlet",
    entityId,
    actorId: context.actorUserId,
    oldValueJson: oldValue === undefined ? undefined : JSON.stringify(oldValue),
    newValueJson: newValue === undefined ? undefined : JSON.stringify(newValue),
    reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  if (!result.created) {
    throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
  }
};

const merge = (existing: OutletRecord, input: Partial<OutletWriteInput>): OutletWriteInput => ({
  name: input.name ?? existing.name,
  code: input.code !== undefined ? input.code : existing.code,
  address: input.address !== undefined ? input.address : existing.address,
  phone: input.phone !== undefined ? input.phone : existing.phone,
  manager_user_id:
    input.manager_user_id !== undefined
      ? input.manager_user_id
      : existing.manager_user_id,
  gps_lat: input.gps_lat !== undefined ? input.gps_lat : existing.gps_lat,
  gps_lng: input.gps_lng !== undefined ? input.gps_lng : existing.gps_lng,
  status: input.status ?? existing.status,
});

const ensureOutlet = async (env: Env, companyId: string, id: string) => {
  const outlet = await outletsRepository.findOutletById(env, companyId, id);
  if (!outlet) throw new NotFoundError("The requested outlet could not be found.");
  return outlet;
};

const ensureUniqueCode = async (
  env: Env,
  companyId: string,
  code: string | null | undefined,
  currentId?: string,
) => {
  if (!code) return;
  const existing = await outletsRepository.findOutletByCode(env, companyId, code);
  if (existing && existing.id !== currentId) {
    throw new ConflictError("This outlet code is already in use.");
  }
};

export const listOutlets = async (
  env: Env,
  context: AuthActor,
  filters: OutletFilters,
) => {
  const [total, rows] = await Promise.all([
    outletsRepository.countOutlets(env, context.companyId, filters),
    outletsRepository.listOutlets(env, context.companyId, filters),
  ]);
  const pagination: PaginationMeta = {
    page: filters.page,
    page_size: filters.page_size,
    total,
    total_pages: Math.ceil(total / filters.page_size),
  };
  return { rows, pagination };
};

export const getOutlet = (env: Env, context: AuthActor, id: string) =>
  ensureOutlet(env, context.companyId, id);

export const createOutlet = async (
  env: Env,
  context: AuthActor,
  input: OutletWriteInput,
) => {
  await ensureUniqueCode(env, context.companyId, input.code);
  const id = createPrefixedId("outlet");
  await outletsRepository.createOutlet(env, id, context.companyId, input);
  await audit(env, context, "outlet_created", id, undefined, input);
  return { outlet: await ensureOutlet(env, context.companyId, id) };
};

export const updateOutlet = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: Partial<OutletWriteInput>,
) => {
  const existing = await ensureOutlet(env, context.companyId, id);
  const merged = merge(existing, input);
  await ensureUniqueCode(env, context.companyId, merged.code, id);
  await outletsRepository.updateOutlet(env, context.companyId, id, merged);
  await audit(env, context, "outlet_updated", id, existing, merged);
  await broadcastEvent(env, {
    roomName: `company:${context.companyId}`,
    type: "outlets.updated",
    payload: { outlet_id: id },
    triggeredBy: context.actorUserId,
  }).catch(() => undefined);
  return { outlet: await ensureOutlet(env, context.companyId, id) };
};

export const setOutletStatus = async (
  env: Env,
  context: AuthActor,
  id: string,
  status: "active" | "disabled",
  reason: string,
) => {
  const existing = await ensureOutlet(env, context.companyId, id);
  const merged = merge(existing, { status });
  await outletsRepository.updateOutlet(env, context.companyId, id, merged);
  await audit(
    env,
    context,
    status === "active" ? "outlet_enabled" : "outlet_disabled",
    id,
    existing,
    merged,
    reason,
  );
  return { updated: true };
};
