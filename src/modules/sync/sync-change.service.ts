import * as repository from "./sync.repository";
import { createPrefixedId } from "../../utils/ids";

export const createSyncChange = async (
  env: Env,
  input: {
    companyId: string;
    outletId?: string | null;
    entityType: string;
    entityId: string;
    actionType: string;
    changedBy?: string | null;
    payload?: Record<string, unknown>;
  },
) => {
  const changeVersion = await repository.nextChangeVersion(env, input.companyId);
  await repository.createChange(env, {
    id: createPrefixedId("sync_change"),
    companyId: input.companyId,
    outletId: input.outletId,
    entityType: input.entityType,
    entityId: input.entityId,
    actionType: input.actionType,
    changeVersion,
    changedBy: input.changedBy,
    payloadSummaryJson: input.payload ? JSON.stringify(input.payload) : null,
  });

  return changeVersion;
};

export const getLatestSyncToken = (env: Env, companyId: string) =>
  repository.getMaxChangeVersion(env, companyId);
