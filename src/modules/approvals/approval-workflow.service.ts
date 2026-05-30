import type { WorkflowFilters, WorkflowInput, WorkflowUpdateInput } from "./approvals.types";
import * as repository from "./approvals.repository";

export const listWorkflows = async (env: Env, companyId: string, filters: WorkflowFilters) => {
  const [total, rows] = await Promise.all([
    repository.countWorkflows(env, companyId, filters),
    repository.listWorkflows(env, companyId, filters),
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

export const getWorkflow = repository.findWorkflowById;
export const getWorkflowByKey = repository.findWorkflowByKey;
export const createWorkflow = (env: Env, id: string, companyId: string, input: WorkflowInput) =>
  repository.createWorkflow(env, id, companyId, input);
export const updateWorkflow = (env: Env, companyId: string, id: string, input: WorkflowUpdateInput) =>
  repository.updateWorkflow(env, companyId, id, input);
