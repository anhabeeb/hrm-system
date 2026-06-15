import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type {
  BusinessFunction,
  FunctionAssignment,
  MatrixSummary,
  OperationCatalogEntry,
  OperationResponsibility,
  SetupWarning,
} from "./operation-ownership.types";

type Filters = Record<string, string | number | boolean | undefined | null>;

export const operationOwnershipApi = {
  listBusinessFunctions: (filters: Filters = {}) => api.get<BusinessFunction[]>(`/operation-ownership/business-functions${buildQueryString(filters)}`),
  createBusinessFunction: (payload: Partial<BusinessFunction>) => api.post<{ business_function: BusinessFunction }>("/operation-ownership/business-functions", payload),
  updateBusinessFunction: (id: string, payload: Partial<BusinessFunction>) => api.patch<{ business_function: BusinessFunction }>(`/operation-ownership/business-functions/${id}`, payload),
  disableBusinessFunction: (id: string) => api.post<{ business_function: BusinessFunction }>(`/operation-ownership/business-functions/${id}/disable`, {}),
  enableBusinessFunction: (id: string) => api.post<{ business_function: BusinessFunction }>(`/operation-ownership/business-functions/${id}/enable`, {}),
  archiveBusinessFunction: (id: string) => api.post<{ business_function: BusinessFunction }>(`/operation-ownership/business-functions/${id}/archive`, {}),

  listFunctionAssignments: (filters: Filters = {}) => api.get<FunctionAssignment[]>(`/operation-ownership/function-assignments${buildQueryString(filters)}`),
  createFunctionAssignment: (payload: Partial<FunctionAssignment>) => api.post<{ assignment: FunctionAssignment }>("/operation-ownership/function-assignments", payload),
  updateFunctionAssignment: (id: string, payload: Partial<FunctionAssignment>) => api.patch<{ assignment: FunctionAssignment }>(`/operation-ownership/function-assignments/${id}`, payload),
  disableFunctionAssignment: (id: string) => api.post<{ assignment: FunctionAssignment }>(`/operation-ownership/function-assignments/${id}/disable`, {}),
  enableFunctionAssignment: (id: string) => api.post<{ assignment: FunctionAssignment }>(`/operation-ownership/function-assignments/${id}/enable`, {}),
  archiveFunctionAssignment: (id: string) => api.post<{ assignment: FunctionAssignment }>(`/operation-ownership/function-assignments/${id}/archive`, {}),

  listOperations: (filters: Filters = {}) => api.get<OperationCatalogEntry[]>(`/operation-ownership/operations${buildQueryString(filters)}`),
  createOperation: (payload: Partial<OperationCatalogEntry>) => api.post<{ operation: OperationCatalogEntry }>("/operation-ownership/operations", payload),
  updateOperation: (operationCode: string, payload: Partial<OperationCatalogEntry>) => api.patch<{ operation: OperationCatalogEntry }>(`/operation-ownership/operations/${operationCode}`, payload),
  disableOperation: (operationCode: string) => api.post<{ operation: OperationCatalogEntry }>(`/operation-ownership/operations/${operationCode}/disable`, {}),
  enableOperation: (operationCode: string) => api.post<{ operation: OperationCatalogEntry }>(`/operation-ownership/operations/${operationCode}/enable`, {}),
  archiveOperation: (operationCode: string) => api.post<{ operation: OperationCatalogEntry }>(`/operation-ownership/operations/${operationCode}/archive`, {}),

  listResponsibilities: (filters: Filters = {}) => api.get<OperationResponsibility[]>(`/operation-ownership/responsibilities${buildQueryString(filters)}`),
  createResponsibility: (payload: Partial<OperationResponsibility>) => api.post<{ responsibility: OperationResponsibility }>("/operation-ownership/responsibilities", payload),
  updateResponsibility: (id: string, payload: Partial<OperationResponsibility>) => api.patch<{ responsibility: OperationResponsibility }>(`/operation-ownership/responsibilities/${id}`, payload),
  disableResponsibility: (id: string) => api.post<{ responsibility: OperationResponsibility }>(`/operation-ownership/responsibilities/${id}/disable`, {}),
  enableResponsibility: (id: string) => api.post<{ responsibility: OperationResponsibility }>(`/operation-ownership/responsibilities/${id}/enable`, {}),
  archiveResponsibility: (id: string) => api.post<{ responsibility: OperationResponsibility }>(`/operation-ownership/responsibilities/${id}/archive`, {}),
  listOperationResponsibilities: (operationCode: string, filters: Filters = {}) => api.get<OperationResponsibility[]>(`/operation-ownership/operations/${operationCode}/responsibilities${buildQueryString(filters)}`),
  createOperationResponsibility: (operationCode: string, payload: Partial<OperationResponsibility>) => api.post<{ responsibility: OperationResponsibility }>(`/operation-ownership/operations/${operationCode}/responsibilities`, payload),

  getMatrixSummary: () => api.get<{ summary: MatrixSummary }>("/operation-ownership/matrix-summary"),
  getSetupWarnings: () => api.get<{ warnings: SetupWarning[] }>("/operation-ownership/setup-warnings"),
  resolve: (payload: { operation_code: string; responsibility_type: string }) => api.post<{ resolution: unknown }>("/operation-ownership/resolve", payload),
};
