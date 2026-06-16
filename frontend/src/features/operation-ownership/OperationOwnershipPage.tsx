import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/feedback/useToast";
import { ModuleAttentionPanel, ModuleLandingHeader, ModuleLandingShell, ModuleQuickActions, ModuleSummaryGrid, ModuleSummaryTile } from "@/components/module-landing";
import { departmentsApi } from "@/features/departments/departments.api";
import { rolesApi } from "@/features/roles/roles.api";
import { usersApi } from "@/features/users/users.api";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";
import { BusinessFunctionDialog, emptyBusinessFunctionForm, type BusinessFunctionFormState } from "./BusinessFunctionDialog";
import { BusinessFunctionsTable } from "./BusinessFunctionsTable";
import { FunctionAssignmentDialog, emptyFunctionAssignmentForm, type FunctionAssignmentFormState } from "./FunctionAssignmentDialog";
import { FunctionAssignmentsTable } from "./FunctionAssignmentsTable";
import { OperationCatalogTable } from "./OperationCatalogTable";
import { OperationMatrixTable } from "./OperationMatrixTable";
import { OperationResolveDialog } from "./OperationResolveDialog";
import { OperationResponsibilityDialog, emptyResponsibilityForm, type ResponsibilityFormState } from "./OperationResponsibilityDialog";
import { SetupWarningsPanel } from "./SetupWarningsPanel";
import { operationOwnershipApi } from "./operation-ownership.api";
import type { BusinessFunction, FunctionAssignment, OperationResponsibility } from "./operation-ownership.types";

const safeError = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;

const toPayload = (form: ResponsibilityFormState): Partial<OperationResponsibility> => ({
  operation_code: form.operation_code,
  responsibility_type: form.responsibility_type,
  target_type: form.target_type,
  business_function_id: form.target_type === "BUSINESS_FUNCTION" ? form.business_function_id : null,
  department_id: form.target_type === "DEPARTMENT" ? form.department_id : null,
  user_id: form.target_type === "SPECIFIC_USER" ? form.user_id : null,
  min_level: form.min_level ? Number(form.min_level) : null,
  max_level: form.max_level ? Number(form.max_level) : null,
  required_permission: form.required_permission || null,
  required_role_id: form.required_role_id || null,
  permission_key: form.required_permission || null,
  role_id: form.required_role_id || null,
  fallback_behavior: form.fallback_behavior,
  requires_approval: form.requires_approval === "true" ? 1 : 0,
  use_requester_department: form.target_type === "REQUESTER_DEPARTMENT" ? 1 : 0,
  use_subject_department: form.target_type === "SUBJECT_DEPARTMENT" ? 1 : 0,
  is_required: form.is_required === "true" ? 1 : 0,
  is_active: form.is_active === "true" ? 1 : 0,
} as Partial<OperationResponsibility>);

const businessFunctionPayload = (form: BusinessFunctionFormState): Partial<BusinessFunction> => ({
  code: form.code,
  name: form.name,
  description: form.description || null,
  is_sensitive: form.is_sensitive === "true" ? 1 : 0,
  is_active: form.is_active === "true" ? 1 : 0,
});

const assignmentPayload = (form: FunctionAssignmentFormState): Partial<FunctionAssignment> => ({
  business_function_id: form.business_function_id,
  department_id: form.department_id,
  assignment_type: form.assignment_type,
  is_primary: form.is_primary === "true" ? 1 : 0,
  is_active: form.is_active === "true" ? 1 : 0,
});

const formFromRow = (row: OperationResponsibility): ResponsibilityFormState => ({
  operation_code: row.operation_code,
  responsibility_type: row.responsibility_type,
  target_type: row.target_type ?? (row.business_function_id ? "BUSINESS_FUNCTION" : row.department_id ? "DEPARTMENT" : row.user_id ? "SPECIFIC_USER" : "SUPER_ADMIN"),
  business_function_id: row.business_function_id ?? "",
  department_id: row.department_id ?? "",
  user_id: row.user_id ?? "",
  min_level: row.min_level ? String(row.min_level) : "",
  max_level: row.max_level ? String(row.max_level) : "",
  required_permission: row.required_permission ?? row.permission_key ?? "",
  required_role_id: row.required_role_id ?? row.role_id ?? "",
  fallback_behavior: row.fallback_behavior,
  requires_approval: row.requires_approval === 1 ? "true" : "false",
  is_required: row.is_required === 1 ? "true" : "false",
  is_active: row.is_active === 1 ? "true" : "false",
  reason: "",
});

const businessFunctionFormFromRow = (row: BusinessFunction): BusinessFunctionFormState => ({
  code: row.code,
  name: row.name,
  description: row.description ?? "",
  is_sensitive: row.is_sensitive === 1 ? "true" : "false",
  is_active: row.is_active === 1 ? "true" : "false",
});

const assignmentFormFromRow = (row: FunctionAssignment): FunctionAssignmentFormState => ({
  business_function_id: row.business_function_id,
  department_id: row.department_id,
  assignment_type: row.assignment_type || "PRIMARY",
  is_primary: row.is_primary === 1 ? "true" : "false",
  is_active: row.is_active === 1 ? "true" : "false",
});

// operation ownership frontend page: compact matrix setup for business responsibility routing.
export const OperationOwnershipPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [businessFunctionOpen, setBusinessFunctionOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveResult, setResolveResult] = useState<unknown>(null);
  const [selected, setSelected] = useState<OperationResponsibility | null>(null);
  const [selectedBusinessFunction, setSelectedBusinessFunction] = useState<BusinessFunction | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<FunctionAssignment | null>(null);
  const [form, setForm] = useState<ResponsibilityFormState>(emptyResponsibilityForm());
  const [businessFunctionForm, setBusinessFunctionForm] = useState<BusinessFunctionFormState>(emptyBusinessFunctionForm());
  const [assignmentForm, setAssignmentForm] = useState<FunctionAssignmentFormState>(emptyFunctionAssignmentForm());
  const [matrixFilters, setMatrixFilters] = useState({
    module: "all",
    operation: "",
    responsibility_type: "all",
    target_type: "all",
    business_function_id: "all",
    department_id: "all",
    status: "all",
    sensitive: "all",
  });

  const canManage = auth.hasAnyPermission(["operationOwnership.manage", "operationOwnership.matrix.manage"]);
  const canManageFunctions = auth.hasAnyPermission(["operationOwnership.businessFunctions.manage", "operationOwnership.manage"]);
  const canManageAssignments = auth.hasAnyPermission(["operationOwnership.assignments.manage", "operationOwnership.manage"]);
  const canManageSensitive = auth.hasPermission("operationOwnership.sensitive.manage");
  const summaryQuery = useQuery({ queryKey: ["operation-ownership", "summary"], queryFn: operationOwnershipApi.getMatrixSummary });
  const warningsQuery = useQuery({ queryKey: ["operation-ownership", "warnings"], queryFn: operationOwnershipApi.getSetupWarnings });
  const functionsQuery = useQuery({ queryKey: ["operation-ownership", "functions"], queryFn: () => operationOwnershipApi.listBusinessFunctions({ page_size: 100 }) });
  const assignmentsQuery = useQuery({ queryKey: ["operation-ownership", "assignments"], queryFn: () => operationOwnershipApi.listFunctionAssignments({ page_size: 100 }) });
  const operationsQuery = useQuery({ queryKey: ["operation-ownership", "operations"], queryFn: () => operationOwnershipApi.listOperations({ page_size: 100 }) });
  const responsibilitiesQuery = useQuery({ queryKey: ["operation-ownership", "responsibilities"], queryFn: () => operationOwnershipApi.listResponsibilities({ page_size: 100 }) });
  const departmentsQuery = useQuery({ queryKey: ["operation-ownership", "departments"], queryFn: () => departmentsApi.list({ page_size: 100, status: "active" }), enabled: canManage || canManageAssignments });
  const usersQuery = useQuery({ queryKey: ["operation-ownership", "users"], queryFn: () => usersApi.list({ page_size: 100, status: "active" }), enabled: canManage });
  const rolesQuery = useQuery({ queryKey: ["operation-ownership", "roles"], queryFn: () => rolesApi.list({ page_size: 100, status: "active" }), enabled: canManage });
  const permissionsQuery = useQuery({ queryKey: ["operation-ownership", "permissions"], queryFn: rolesApi.permissions, enabled: canManage });

  const invalidate = async () => queryClient.invalidateQueries({ queryKey: ["operation-ownership"] });
  const saveResponsibility = useMutation({
    mutationFn: () => selected ? operationOwnershipApi.updateResponsibility(selected.id, toPayload(form)) : operationOwnershipApi.createResponsibility(toPayload(form)),
    onSuccess: async () => {
      toast.success(selected ? "Operation responsibility updated." : "Operation responsibility saved.");
      setDialogOpen(false);
      setSelected(null);
      setForm(emptyResponsibilityForm());
      await invalidate();
    },
    onError: (error) => toast.error("Operation responsibility could not be saved.", safeError(error, "Please review the responsibility and try again.")),
  });
  const saveBusinessFunction = useMutation({
    mutationFn: () => selectedBusinessFunction
      ? operationOwnershipApi.updateBusinessFunction(selectedBusinessFunction.id, businessFunctionPayload(businessFunctionForm))
      : operationOwnershipApi.createBusinessFunction(businessFunctionPayload(businessFunctionForm)),
    onSuccess: async () => {
      toast.success(selectedBusinessFunction ? "Business function updated." : "Business function created.");
      setBusinessFunctionOpen(false);
      setSelectedBusinessFunction(null);
      setBusinessFunctionForm(emptyBusinessFunctionForm());
      await invalidate();
    },
    onError: (error) => toast.error("Business function could not be saved.", safeError(error, "Please review the function and try again.")),
  });
  const businessFunctionStatus = useMutation({
    mutationFn: ({ row, action }: { row: BusinessFunction; action: "enable" | "disable" | "archive" }) => {
      if (action === "enable") return operationOwnershipApi.enableBusinessFunction(row.id);
      if (action === "archive") return operationOwnershipApi.archiveBusinessFunction(row.id);
      return operationOwnershipApi.disableBusinessFunction(row.id);
    },
    onSuccess: async (_, variables) => {
      toast.success(`Business function ${variables.action}d.`);
      await invalidate();
    },
    onError: (error) => toast.error("Business function action failed.", safeError(error, "Please try again.")),
  });
  const saveAssignment = useMutation({
    mutationFn: () => selectedAssignment
      ? operationOwnershipApi.updateFunctionAssignment(selectedAssignment.id, assignmentPayload(assignmentForm))
      : operationOwnershipApi.createFunctionAssignment(assignmentPayload(assignmentForm)),
    onSuccess: async () => {
      toast.success(selectedAssignment ? "Function assignment updated." : "Business function assigned.");
      setAssignmentOpen(false);
      setSelectedAssignment(null);
      setAssignmentForm(emptyFunctionAssignmentForm());
      await invalidate();
    },
    onError: (error) => toast.error("Function assignment could not be saved.", safeError(error, "Please review the assignment and try again.")),
  });
  const assignmentStatus = useMutation({
    mutationFn: ({ row, action }: { row: FunctionAssignment; action: "enable" | "disable" | "archive" }) => {
      if (action === "enable") return operationOwnershipApi.enableFunctionAssignment(row.id);
      if (action === "archive") return operationOwnershipApi.archiveFunctionAssignment(row.id);
      return operationOwnershipApi.disableFunctionAssignment(row.id);
    },
    onSuccess: async (_, variables) => {
      toast.success(`Function assignment ${variables.action}d.`);
      await invalidate();
    },
    onError: (error) => toast.error("Function assignment action failed.", safeError(error, "Please try again.")),
  });
  const statusMutation = useMutation({
    mutationFn: ({ row, action }: { row: OperationResponsibility; action: "enable" | "disable" | "archive" }) => {
      if (action === "enable") return operationOwnershipApi.enableResponsibility(row.id);
      if (action === "archive") return operationOwnershipApi.archiveResponsibility(row.id);
      return operationOwnershipApi.disableResponsibility(row.id);
    },
    onSuccess: async (_, variables) => {
      toast.success(`Operation responsibility ${variables.action}d.`);
      await invalidate();
    },
    onError: (error) => toast.error("Operation responsibility action failed.", safeError(error, "Please try again.")),
  });
  const resolveMutation = useMutation({
    mutationFn: () => operationOwnershipApi.resolve({ operation_code: form.operation_code, responsibility_type: form.responsibility_type }),
    onSuccess: (result) => {
      setResolveResult(result.data.resolution);
      setResolveOpen(true);
    },
    onError: (error) => toast.error("Operation responsibility could not be resolved.", safeError(error, "Please review the selected operation.")),
  });

  const summary = summaryQuery.data?.data.summary;
  const operations = operationsQuery.data?.data ?? [];
  const operationByCode = useMemo(() => new Map(operations.map((operation) => [operation.operation_code, operation])), [operations]);
  const moduleOptions = useMemo(() => Array.from(new Set(operations.map((operation) => operation.module_key).filter(Boolean))).sort(), [operations]);
  const responsibilities = responsibilitiesQuery.data?.data ?? [];
  const setupWarnings = warningsQuery.data?.data.warnings ?? [];
  const filteredResponsibilities = useMemo(() => responsibilities.filter((row) => {
    const operation = operationByCode.get(row.operation_code);
    if (matrixFilters.module !== "all" && operation?.module_key !== matrixFilters.module) return false;
    if (matrixFilters.operation && !row.operation_code.toLowerCase().includes(matrixFilters.operation.toLowerCase())) return false;
    if (matrixFilters.responsibility_type !== "all" && row.responsibility_type !== matrixFilters.responsibility_type) return false;
    if (matrixFilters.target_type !== "all" && row.target_type !== matrixFilters.target_type) return false;
    if (matrixFilters.business_function_id !== "all" && row.business_function_id !== matrixFilters.business_function_id) return false;
    if (matrixFilters.department_id !== "all" && row.department_id !== matrixFilters.department_id) return false;
    if (matrixFilters.status === "active" && row.is_active !== 1) return false;
    if (matrixFilters.status === "inactive" && row.is_active === 1) return false;
    if (matrixFilters.sensitive === "yes" && operation?.is_sensitive !== 1) return false;
    if (matrixFilters.sensitive === "no" && operation?.is_sensitive === 1) return false;
    return true;
  }), [matrixFilters, operationByCode, responsibilities]);
  const openCreate = () => {
    setSelected(null);
    setForm(emptyResponsibilityForm());
    setDialogOpen(true);
  };
  const openCreateBusinessFunction = () => {
    setSelectedBusinessFunction(null);
    setBusinessFunctionForm(emptyBusinessFunctionForm());
    setBusinessFunctionOpen(true);
  };
  const openCreateAssignment = () => {
    setSelectedAssignment(null);
    setAssignmentForm(emptyFunctionAssignmentForm());
    setAssignmentOpen(true);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <ModuleLandingShell>
        <ModuleLandingHeader
          title="Operation Ownership"
          description="Configure who owns, reviews, approves, executes, and audits HR operations."
          status="Responsibility Matrix"
          actions={(
            <ModuleQuickActions>
              {canManage ? <Button variant="outline" disabled={!form.operation_code || resolveMutation.isPending} onClick={() => resolveMutation.mutate()}>Resolve Preview</Button> : null}
              {canManage ? <Button onClick={openCreate}><ShieldCheck className="h-4 w-4" />Configure Matrix</Button> : null}
              {canManageFunctions ? <Button variant="outline" onClick={openCreateBusinessFunction}>Create Business Function</Button> : null}
              {canManageAssignments ? <Button variant="outline" onClick={openCreateAssignment}>Assign Function</Button> : null}
            </ModuleQuickActions>
          )}
        />
        <ModuleSummaryGrid>
          <ModuleSummaryTile label="Total operations" value={summary?.operations_total ?? "Loading"} />
          <ModuleSummaryTile label="Active responsibilities" value={summary?.active_responsibilities ?? "Loading"} />
          <ModuleSummaryTile label="Missing owner/setup" value={summary?.unassigned_operations ?? "Loading"} status={(summary?.unassigned_operations ?? 0) > 0 ? "warning" : "success"} />
          <ModuleSummaryTile label="Sensitive gaps" value={summary?.sensitive_unassigned_operations ?? "Loading"} status={(summary?.sensitive_unassigned_operations ?? 0) > 0 ? "danger" : "success"} />
          <ModuleSummaryTile label="Business functions" value={summary?.business_functions_total ?? "Loading"} />
          <ModuleSummaryTile label="Function assignments" value={summary?.department_assignments_total ?? "Loading"} />
        </ModuleSummaryGrid>
        <ModuleAttentionPanel
          description="Setup warnings come from the Operation Ownership resolver and responsibility matrix."
          items={[
            setupWarnings.length ? `${setupWarnings.length} setup warning(s) need review.` : null,
            (summary?.unassigned_operations ?? 0) > 0 ? `${summary?.unassigned_operations} operation(s) are missing complete responsibility coverage.` : null,
            (summary?.sensitive_unassigned_operations ?? 0) > 0 ? `${summary?.sensitive_unassigned_operations} sensitive operation(s) have assignment gaps.` : null,
          ]}
        />
      </ModuleLandingShell>

      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="matrix">Operation Matrix</TabsTrigger>
          <TabsTrigger value="functions">Business Functions</TabsTrigger>
          <TabsTrigger value="assignments">Function Assignments</TabsTrigger>
          <TabsTrigger value="catalog">Operation Catalog</TabsTrigger>
          <TabsTrigger value="warnings">Setup Warnings</TabsTrigger>
        </TabsList>
        <TabsContent value="matrix">
          <div className="mb-3 grid gap-2 md:grid-cols-4 xl:grid-cols-8">
            <Select value={matrixFilters.module} onValueChange={(value) => setMatrixFilters((current) => ({ ...current, module: value }))}>
              <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All modules</SelectItem>{moduleOptions.map((module) => <SelectItem key={module} value={module}>{module}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={matrixFilters.operation} placeholder="Operation" onChange={(event) => setMatrixFilters((current) => ({ ...current, operation: event.target.value }))} />
            <Select value={matrixFilters.responsibility_type} onValueChange={(value) => setMatrixFilters((current) => ({ ...current, responsibility_type: value }))}>
              <SelectTrigger><SelectValue placeholder="Responsibility" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All responsibilities</SelectItem>
                {["OWNER", "REQUEST_REVIEW", "DEPARTMENT_REVIEW", "FINAL_APPROVAL", "SECONDARY_APPROVAL", "EXECUTION", "CONFIGURATION", "AUDIT_VIEW", "ESCALATION"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={matrixFilters.target_type} onValueChange={(value) => setMatrixFilters((current) => ({ ...current, target_type: value }))}>
              <SelectTrigger><SelectValue placeholder="Target" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All targets</SelectItem>
                {["BUSINESS_FUNCTION", "DEPARTMENT", "SPECIFIC_USER", "REQUESTER_DEPARTMENT", "SUBJECT_DEPARTMENT", "SUPER_ADMIN"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={matrixFilters.business_function_id} onValueChange={(value) => setMatrixFilters((current) => ({ ...current, business_function_id: value }))}>
              <SelectTrigger><SelectValue placeholder="Function" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All functions</SelectItem>{(functionsQuery.data?.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={matrixFilters.department_id} onValueChange={(value) => setMatrixFilters((current) => ({ ...current, department_id: value }))}>
              <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All departments</SelectItem>{(departmentsQuery.data?.data ?? []).map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={matrixFilters.status} onValueChange={(value) => setMatrixFilters((current) => ({ ...current, status: value }))}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
            </Select>
            <Select value={matrixFilters.sensitive} onValueChange={(value) => setMatrixFilters((current) => ({ ...current, sensitive: value }))}>
              <SelectTrigger><SelectValue placeholder="Sensitive" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All sensitivity</SelectItem><SelectItem value="yes">Sensitive only</SelectItem><SelectItem value="no">Non-sensitive</SelectItem></SelectContent>
            </Select>
          </div>
          <OperationMatrixTable
            loading={responsibilitiesQuery.isLoading}
            rows={filteredResponsibilities}
            canManage={canManage}
            onEdit={(row) => { setSelected(row); setForm(formFromRow(row)); setDialogOpen(true); }}
            onEnable={(row) => statusMutation.mutate({ row, action: "enable" })}
            onDisable={(row) => statusMutation.mutate({ row, action: "disable" })}
            onArchive={(row) => statusMutation.mutate({ row, action: "archive" })}
          />
        </TabsContent>
        <TabsContent value="functions">
          <BusinessFunctionsTable
            rows={functionsQuery.data?.data ?? []}
            loading={functionsQuery.isLoading}
            canManage={canManageFunctions}
            onEdit={(row) => { setSelectedBusinessFunction(row); setBusinessFunctionForm(businessFunctionFormFromRow(row)); setBusinessFunctionOpen(true); }}
            onEnable={(row) => businessFunctionStatus.mutate({ row, action: "enable" })}
            onDisable={(row) => businessFunctionStatus.mutate({ row, action: "disable" })}
            onArchive={(row) => businessFunctionStatus.mutate({ row, action: "archive" })}
          />
        </TabsContent>
        <TabsContent value="assignments">
          <FunctionAssignmentsTable
            rows={assignmentsQuery.data?.data ?? []}
            loading={assignmentsQuery.isLoading}
            canManage={canManageAssignments}
            onEdit={(row) => { setSelectedAssignment(row); setAssignmentForm(assignmentFormFromRow(row)); setAssignmentOpen(true); }}
            onEnable={(row) => assignmentStatus.mutate({ row, action: "enable" })}
            onDisable={(row) => assignmentStatus.mutate({ row, action: "disable" })}
            onArchive={(row) => assignmentStatus.mutate({ row, action: "archive" })}
          />
        </TabsContent>
        <TabsContent value="catalog"><OperationCatalogTable rows={operationsQuery.data?.data ?? []} loading={operationsQuery.isLoading} /></TabsContent>
        <TabsContent value="warnings"><SetupWarningsPanel warnings={setupWarnings} /></TabsContent>
      </Tabs>

      <OperationResponsibilityDialog
        open={dialogOpen}
        loading={saveResponsibility.isPending}
        form={form}
        operations={operationsQuery.data?.data ?? []}
        businessFunctions={functionsQuery.data?.data ?? []}
        departments={departmentsQuery.data?.data ?? []}
        users={usersQuery.data?.data ?? []}
        roles={rolesQuery.data?.data ?? []}
        permissions={permissionsQuery.data?.data ?? []}
        onOpenChange={setDialogOpen}
        onChange={setForm}
        onSubmit={() => saveResponsibility.mutate()}
      />
      <BusinessFunctionDialog
        open={businessFunctionOpen}
        loading={saveBusinessFunction.isPending}
        editing={Boolean(selectedBusinessFunction)}
        form={businessFunctionForm}
        canManageSensitive={canManageSensitive}
        onOpenChange={setBusinessFunctionOpen}
        onChange={setBusinessFunctionForm}
        onSubmit={() => saveBusinessFunction.mutate()}
      />
      <FunctionAssignmentDialog
        open={assignmentOpen}
        loading={saveAssignment.isPending}
        editing={Boolean(selectedAssignment)}
        form={assignmentForm}
        businessFunctions={functionsQuery.data?.data ?? []}
        departments={departmentsQuery.data?.data ?? []}
        onOpenChange={setAssignmentOpen}
        onChange={setAssignmentForm}
        onSubmit={() => saveAssignment.mutate()}
      />
      <OperationResolveDialog open={resolveOpen} result={resolveResult} onOpenChange={setResolveOpen} />
    </div>
  );
};
