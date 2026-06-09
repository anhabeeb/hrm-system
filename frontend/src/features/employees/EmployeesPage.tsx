import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UserPlus } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { departmentsApi } from "@/features/departments/departments.api";
import { outletsApi } from "@/features/outlets/outlets.api";
import { positionsApi } from "@/features/positions/positions.api";
import { ApiError } from "@/lib/api-errors";
import { searchParamNumber } from "@/lib/query-string";
import { EmployeeDetailDrawer } from "./EmployeeDetailDrawer";
import { EmployeeFilters, type EmployeeFilterValues } from "./EmployeeFilters";
import { EmployeeForm } from "./EmployeeForm";
import { EmployeeList } from "./EmployeeList";
import { employeesApi } from "./employees.api";
import type { Employee, EmployeeUpdatePayload } from "./employees.types";
import type { EmployeeFormValues } from "./employees.schema";

const listKey = (filters: Record<string, unknown>) => ["employees", filters];
const saveError = () => new ApiError("The record could not be saved. Please review the form and try again.", { code: "SAVE_FAILED", status: 0 });

export const EmployeesPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [mutationError, setMutationError] = useState<ApiError | null>(null);
  const toast = useToast();

  const filters = useMemo(() => ({
    search: searchParams.get("search") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    department_id: searchParams.get("department_id") || undefined,
    position_id: searchParams.get("position_id") || undefined,
    employee_type: searchParams.get("employee_type") || undefined,
    employment_status: searchParams.get("employment_status") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: EmployeeFilterValues & { page?: number; page_size?: number }) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    });
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };

  const employeesQuery = useQuery({ queryKey: listKey(filters), queryFn: () => employeesApi.list(filters as Parameters<typeof employeesApi.list>[0]) });
  const outletsQuery = useQuery({ queryKey: ["outlets", "options"], queryFn: () => outletsApi.list({ page_size: 100 }) });
  const departmentsQuery = useQuery({ queryKey: ["departments", "options"], queryFn: () => departmentsApi.list({ page_size: 100 }) });
  const positionsQuery = useQuery({ queryKey: ["positions", "options"], queryFn: () => positionsApi.list({ page_size: 100 }) });

  const refreshList = async () => {
    await queryClient.invalidateQueries({ queryKey: ["employees"] });
  };

  const createMutation = useMutation({
    mutationFn: employeesApi.create,
    onSuccess: async () => {
      toastSuccess(toast, "Employee created successfully.");
      setMutationError(null);
      setFormOpen(false);
      await refreshList();
    },
    onError: (error) => {
      setMutationError(error instanceof ApiError ? error : saveError());
      toastError(toast, error, "Employee could not be created.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EmployeeUpdatePayload }) => employeesApi.update(id, payload),
    onSuccess: async () => {
      toastSuccess(toast, "Employee updated successfully.");
      setMutationError(null);
      setFormOpen(false);
      await refreshList();
    },
    onError: (error) => {
      setMutationError(error instanceof ApiError ? error : saveError());
      toastError(toast, error, "Employee could not be updated.");
    },
  });

  const openCreate = () => {
    setMutationError(null);
    setSelectedEmployee(null);
    setFormMode("create");
    setFormOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setMutationError(null);
    setSelectedEmployee(employee);
    setFormMode("edit");
    setFormOpen(true);
  };

  const submitForm = (values: EmployeeFormValues) => {
    if (formMode === "edit" && selectedEmployee) {
      const { employee_code: _employeeCode, primary_outlet_id: _primaryOutletId, employment_status: _employmentStatus, starting_salary: _startingSalary, ...payload } = values;
      updateMutation.mutate({ id: selectedEmployee.id, payload });
      return;
    }
    const { employee_code: _employeeCode, ...payload } = values;
    createMutation.mutate(payload);
  };

  const canCreate = auth.hasPermission("employees.create");
  const canEdit = auth.hasPermission("employees.edit");
  const canManageStatus = auth.hasPermission("employees.manage_status");
  const canManageOffboarding = auth.hasPermission("employees.offboarding.manage") || auth.hasPermission("employees.edit");
  const canManageContracts = auth.hasAnyPermission(["employees.contracts.manage", "contracts.manage", "employees.edit"]);
  const canManageJobChange = auth.hasAnyPermission(["employees.edit", "employees.job_change.manage", "employees.manage"]);
  const canViewSalary = auth.hasAnyPermission(["payroll.view", "employees.salary.view", "employees.view_salary", "salary.view", "salary.history"]);
  const canEditSalary = auth.hasAnyPermission(["payroll.manage", "employees.salary.manage", "employees.edit_salary", "salary.create", "salary.edit"]);
  const canViewDocuments = auth.hasPermission("documents.view") && auth.hasFeature("documents");
  const canViewSensitiveDocuments = auth.hasPermission("documents.view_sensitive");
  const canUploadDocuments = auth.hasPermission("documents.upload") && auth.hasFeature("documents");
  const canEditDocuments = auth.hasPermission("documents.edit") && auth.hasFeature("documents");
  const canViewNotes = auth.hasPermission("employees.view");

  return (
    <div>
      <PageHeader title="Employees" description="Manage employee profiles, work assignments, and HR record foundations" />
      <div className="space-y-4 p-4 md:p-6">
        {employeesQuery.isError ? <InlineAlert title="Employees could not be loaded." variant="error">Please adjust filters or try again.</InlineAlert> : null}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Employee Directory</h2>
            <p className="text-sm text-muted-foreground">Backend-paginated table scoped by your outlet access.</p>
          </div>
          {canCreate ? (
            <Button onClick={openCreate}>
              <UserPlus className="h-4 w-4" />
              Add Employee
            </Button>
          ) : null}
        </div>
        <EmployeeFilters
          filters={filters}
          outlets={outletsQuery.data?.data ?? []}
          departments={departmentsQuery.data?.data ?? []}
          positions={positionsQuery.data?.data ?? []}
          onChange={updateFilters}
          onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))}
        />
        <EmployeeList
          rows={employeesQuery.data?.data ?? []}
          loading={employeesQuery.isLoading}
          pagination={employeesQuery.data?.pagination}
          canEdit={canEdit}
          onView={(employee) => {
            setSelectedEmployee(employee);
            setDrawerOpen(true);
          }}
          onProfile={(employee) => navigate(`/employees/${employee.id}`)}
          onEdit={openEdit}
          onPageChange={(page) => updateFilters({ page })}
          onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
        />
        <EmployeeDetailDrawer
          employee={selectedEmployee}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          onEdit={openEdit}
          canEdit={canEdit}
          canManageJobChange={canManageJobChange}
          canViewSalary={canViewSalary}
          canEditSalary={canEditSalary}
          canViewDocuments={canViewDocuments}
          canViewSensitiveDocuments={canViewSensitiveDocuments}
          canUploadDocuments={canUploadDocuments}
          canEditDocuments={canEditDocuments}
          canViewNotes={canViewNotes}
          canManageStatus={canManageStatus}
          canManageOffboarding={canManageOffboarding}
          canManageContracts={canManageContracts}
        />
        <EmployeeForm
          open={formOpen}
          mode={formMode}
          employee={formMode === "edit" ? selectedEmployee : null}
          outlets={outletsQuery.data?.data ?? []}
          departments={departmentsQuery.data?.data ?? []}
          positions={positionsQuery.data?.data ?? []}
          error={mutationError}
          loading={createMutation.isPending || updateMutation.isPending}
          onOpenChange={setFormOpen}
          onSubmit={submitForm}
        />
      </div>
    </div>
  );
};
