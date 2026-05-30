import * as repository from "./documents.repository";
import type { DocumentFilters, DocumentOutletScope } from "./documents.types";

export const listExpiringDocuments = (env: Env, companyId: string, filters: DocumentFilters, scope: DocumentOutletScope, includeSensitive: boolean) =>
  repository.listDocuments(env, companyId, {
    ...filters,
    expiring_before: filters.expiring_before ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  }, scope, includeSensitive);

export const countExpiringDocuments = (env: Env, companyId: string, filters: DocumentFilters, scope: DocumentOutletScope) =>
  repository.countDocuments(env, companyId, {
    ...filters,
    expiring_before: filters.expiring_before ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  }, scope);

export const getMissingDocuments = async (env: Env, companyId: string, scope: DocumentOutletScope, outletId?: string) => {
  const [employees, categories, documents] = await Promise.all([
    repository.listEmployeesForMissing(env, companyId, scope.outletIds, scope.isSuperAdmin, outletId),
    repository.listActiveRequiredCategories(env, companyId),
    repository.listEmployeeDocumentTypes(env, companyId),
  ]);
  const existing = new Set(documents.map((row) => `${row.employee_id}:${row.document_type}`));
  const rows: any[] = [];
  for (const employee of employees) {
    for (const category of categories) {
      const applies =
        (employee.employee_type === "foreign" && category.applies_to_foreign_employee === 1) ||
        (employee.employee_type !== "foreign" && category.applies_to_local_employee === 1);
      if (applies && !existing.has(`${employee.id}:${category.category_key}`)) {
        rows.push({
          employee_id: employee.id,
          employee_code: employee.employee_code,
          employee_name: employee.full_name,
          outlet_id: employee.primary_outlet_id,
          document_type: category.category_key,
          document_category_name: category.category_name,
          is_sensitive: category.is_sensitive,
        });
      }
    }
  }
  return rows;
};
