import type { ThresholdFilters, ThresholdInput } from "./approvals.types";
import * as repository from "./approvals.repository";

export const listThresholds = async (env: Env, companyId: string, filters: ThresholdFilters) => {
  const [total, rows] = await Promise.all([
    repository.countThresholds(env, companyId, filters),
    repository.listThresholds(env, companyId, filters),
  ]);

  return {
    rows,
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    },
  };
};

export const getThreshold = repository.findThresholdById;
export const createThreshold = (env: Env, id: string, companyId: string, input: ThresholdInput) =>
  repository.createThreshold(env, id, companyId, input);
export const updateThreshold = repository.updateThreshold;
export const createThresholdHistory = repository.createThresholdHistory;
export const listThresholdHistory = repository.listThresholdHistory;
