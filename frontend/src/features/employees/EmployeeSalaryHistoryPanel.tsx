import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approvalsApi } from "@/features/approvals/approvals.api";
import type { ApprovalRequest } from "@/features/approvals/approvals.types";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";
import { displayDate, displayMoney } from "./employee-format";
import { compensationDefinitionsApi, employeesApi } from "./employees.api";
import type {
  CompensationComponentDefinition,
  CompensationCalculationType,
  CompensationComponentType,
  EmployeeCompensationComponent,
  EmployeeCompensationComponentPayload,
  EmployeeSalaryChangePayload,
  EmployeeSalaryRow,
} from "./employees.types";

const today = () => new Date().toISOString().slice(0, 10);

const changeTypeLabels: Record<EmployeeSalaryChangePayload["change_type"], string> = {
  starting_salary: "Starting salary",
  increment: "Increment",
  promotion: "Promotion",
  correction: "Correction",
  contract_change: "Contract change",
  other: "Other",
};

const componentTypeLabels: Record<CompensationComponentType, string> = {
  allowance: "Allowance",
  benefit: "Benefit",
  deduction: "Recurring deduction",
};

const calculationTypeLabels: Record<CompensationCalculationType, string> = {
  fixed_amount: "Fixed amount",
  percentage_of_basic_salary: "Percentage of basic salary",
  non_cash_benefit: "Non-cash benefit",
};

const majorToMinor = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

const minorToMajor = (value?: number | null) => {
  if (!value) return "";
  return (value / 100).toFixed(2).replace(/\.00$/, "");
};

const findCurrentSalary = (history: EmployeeSalaryRow[]) =>
  history.find((row) => !row.effective_to) ?? history[0] ?? null;

const formatChangeType = (value?: string | null) =>
  value && value in changeTypeLabels ? changeTypeLabels[value as EmployeeSalaryChangePayload["change_type"]] : value ?? "Not recorded";

const formatComponentType = (value?: string | null) =>
  value && value in componentTypeLabels ? componentTypeLabels[value as CompensationComponentType] : value ?? "Not recorded";

const formatCalculationType = (value?: string | null) =>
  value && value in calculationTypeLabels ? calculationTypeLabels[value as CompensationCalculationType] : value ?? "Not recorded";

const boolValue = (value?: number | boolean | null) => value === true || value === 1;

const formatComponentAmount = (component: Pick<EmployeeCompensationComponent, "amount" | "currency" | "calculation_type">) =>
  component.calculation_type === "percentage_of_basic_salary"
    ? `${component.amount}%`
    : displayMoney(component.amount, component.currency ?? "MVR");

const defaultComponentForm = (type: CompensationComponentType) => ({
  component_definition_id: "",
  component_type: type,
  component_code: "",
  component_name: "",
  category: "",
  amount_major: "",
  currency: "MVR",
  calculation_type: (type === "benefit" ? "non_cash_benefit" : "fixed_amount") as CompensationCalculationType,
  affects_gross_pay: type === "allowance",
  affects_net_pay: type !== "benefit",
  effective_from: today(),
  reason: "",
  notes: "",
});

const proposedSalary = (approval: ApprovalRequest) => {
  const payload = (approval.payload_json ?? approval.payload_summary ?? {}) as Record<string, unknown>;
  const proposed = payload.proposed_salary as Record<string, unknown> | undefined;
  return proposed ?? {};
};

const compensationPayload = (approval: ApprovalRequest) =>
  (approval.payload_json ?? approval.payload_summary ?? {}) as Record<string, unknown>;

const proposedCompensationComponent = (approval: ApprovalRequest) => {
  const payload = compensationPayload(approval);
  return (payload.proposed_component ?? payload.current_component ?? {}) as Record<string, unknown>;
};

const endingCompensationComponent = (approval: ApprovalRequest) => {
  const payload = compensationPayload(approval);
  return (payload.end_component ?? {}) as Record<string, unknown>;
};

interface EmployeeSalaryHistoryPanelProps {
  employeeId: string;
  canViewSalary: boolean;
  canEditSalary: boolean;
}

export const EmployeeSalaryHistoryPanel = ({ employeeId, canViewSalary, canEditSalary }: EmployeeSalaryHistoryPanelProps) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [cancelApprovalTarget, setCancelApprovalTarget] = useState<ApprovalRequest | null>(null);
  const [form, setForm] = useState({
    monthly_salary_major: "",
    currency: "MVR",
    effective_from: today(),
    change_type: "increment" as EmployeeSalaryChangePayload["change_type"],
    reason: "",
  });
  const [componentFormOpen, setComponentFormOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<EmployeeCompensationComponent | null>(null);
  const [componentForm, setComponentForm] = useState(defaultComponentForm("allowance"));
  const [endingComponent, setEndingComponent] = useState<EmployeeCompensationComponent | null>(null);
  const [endForm, setEndForm] = useState({ effective_to: today(), reason: "" });
  const [localFieldErrors, setLocalFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["employee-salary-history", employeeId],
    queryFn: () => employeesApi.salaryHistory(employeeId),
    enabled: canViewSalary,
  });
  const summaryQuery = useQuery({
    queryKey: ["employee-compensation-summary", employeeId],
    queryFn: () => employeesApi.compensationSummary(employeeId),
    enabled: canViewSalary,
    retry: false,
  });
  const componentsQuery = useQuery({
    queryKey: ["employee-compensation-components", employeeId],
    queryFn: () => employeesApi.compensationComponents(employeeId),
    enabled: canViewSalary,
    retry: false,
  });
  const definitionsQuery = useQuery({
    queryKey: ["compensation-component-definitions", "active"],
    queryFn: () => compensationDefinitionsApi.list({ status: "active", page: 1, page_size: 100 }),
    enabled: canViewSalary,
    retry: false,
  });
  const canViewApprovals = auth.isSuperAdmin || auth.hasPermission("approvals.view");
  const pendingQuery = useQuery({
    queryKey: ["employee-salary-approvals", employeeId],
    queryFn: async () => {
      const [salary, compensation] = await Promise.all([
        approvalsApi.list({
          module: "salary",
          employee_id: employeeId,
          page: 1,
          page_size: 10,
        }),
        approvalsApi.list({
          module: "compensation",
          employee_id: employeeId,
          page: 1,
          page_size: 10,
        }),
      ]);
      return {
        ...salary,
        data: [...(salary.data ?? []), ...(compensation.data ?? [])],
      };
    },
    enabled: canViewSalary && canViewApprovals,
    retry: false,
  });

  const history = query.data?.data.history ?? [];
  const summary = summaryQuery.data?.data.summary ?? null;
  const components = componentsQuery.data?.data.components ?? [];
  const definitions = definitionsQuery.data?.data ?? [];
  const activeComponents = components.filter((component) => ["active", "scheduled", "pending_approval"].includes(component.effective_status ?? component.status));
  const historicalComponents = components.filter((component) => !["active", "scheduled", "pending_approval"].includes(component.effective_status ?? component.status));
  const pendingApprovals = (pendingQuery.data?.data ?? []).filter((row) => ["pending", "in_progress", "failed", "returned", "returned_for_more_info"].includes(row.status ?? "pending"));
  const pendingSalaryApprovals = pendingApprovals.filter((row) => row.module === "salary");
  const pendingCompensationApprovals = pendingApprovals.filter((row) => row.module === "compensation");
  const currentSalary = useMemo(() => findCurrentSalary(history), [history]);
  const newSalaryMinor = majorToMinor(form.monthly_salary_major);
  const salaryDifference = currentSalary && newSalaryMinor !== null ? newSalaryMinor - currentSalary.monthly_salary_amount : null;

  const addSalaryMutation = useMutation({
    mutationFn: (payload: EmployeeSalaryChangePayload) => employeesApi.addSalaryHistory(employeeId, payload),
    onSuccess: async (response) => {
      setSuccessMessage(response.message ?? "Salary change saved successfully.");
      setFormOpen(false);
      setLocalFieldErrors({});
      await queryClient.invalidateQueries({ queryKey: ["employee-salary-history", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["employee-salary-approvals", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
  const refreshCompensation = async () => {
    await queryClient.invalidateQueries({ queryKey: ["employee-compensation-summary", employeeId] });
    await queryClient.invalidateQueries({ queryKey: ["employee-compensation-components", employeeId] });
    await queryClient.invalidateQueries({ queryKey: ["employee-salary-approvals", employeeId] });
  };
  const addComponentMutation = useMutation({
    mutationFn: (payload: EmployeeCompensationComponentPayload) => employeesApi.addCompensationComponent(employeeId, payload),
    onSuccess: async (response) => {
      setSuccessMessage(response.message ?? "Compensation component added successfully.");
      setComponentFormOpen(false);
      setEditingComponent(null);
      setLocalFieldErrors({});
      await refreshCompensation();
    },
  });
  const changeComponentMutation = useMutation({
    mutationFn: ({ componentId, payload }: { componentId: string; payload: EmployeeCompensationComponentPayload }) =>
      employeesApi.changeCompensationComponent(employeeId, componentId, payload),
    onSuccess: async (response) => {
      setSuccessMessage(response.message ?? "Compensation component changed successfully.");
      setComponentFormOpen(false);
      setEditingComponent(null);
      setLocalFieldErrors({});
      await refreshCompensation();
    },
  });
  const endComponentMutation = useMutation({
    mutationFn: ({ componentId, effective_to, reason }: { componentId: string; effective_to: string; reason: string }) =>
      employeesApi.endCompensationComponent(employeeId, componentId, { effective_to, reason }),
    onSuccess: async (response) => {
      setSuccessMessage(response.message ?? "Compensation component ended successfully.");
      await refreshCompensation();
    },
  });
  const cancelApprovalMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => approvalsApi.cancel(id, reason),
    onSuccess: async (response) => {
      setSuccessMessage(response.message ?? "Approval request cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["employee-salary-approvals", employeeId] });
    },
  });
  const cancelApproval = (approval: ApprovalRequest) => setCancelApprovalTarget(approval);
  const apiError = addSalaryMutation.error instanceof ApiError ? addSalaryMutation.error : null;
  const componentApiError =
    addComponentMutation.error instanceof ApiError
      ? addComponentMutation.error
      : changeComponentMutation.error instanceof ApiError
        ? changeComponentMutation.error
        : endComponentMutation.error instanceof ApiError
          ? endComponentMutation.error
          : null;
  const fieldError = (field: string) => localFieldErrors[field] ?? apiError?.fieldErrors?.[field] ?? componentApiError?.fieldErrors?.[field];

  const openSalaryForm = () => {
    setSuccessMessage(null);
    setLocalFieldErrors({});
    addSalaryMutation.reset();
    setForm({
      monthly_salary_major: currentSalary ? minorToMajor(currentSalary.monthly_salary_amount) : "",
      currency: currentSalary?.currency ?? "MVR",
      effective_from: today(),
      change_type: currentSalary ? "increment" : "starting_salary",
      reason: "",
    });
    setFormOpen(true);
  };

  const submitSalaryChange = () => {
    const errors: Record<string, string> = {};
    const amount = majorToMinor(form.monthly_salary_major);
    if (amount === null) errors.monthly_salary_amount = "Enter a positive salary amount.";
    if (!form.effective_from) errors.effective_from = "Select an effective date.";
    if (!form.reason.trim()) errors.reason = "Reason is required.";
    if (!form.currency.trim()) errors.currency = "Currency is required.";

    setLocalFieldErrors(errors);
    if (Object.keys(errors).length > 0 || amount === null) return;

    addSalaryMutation.mutate({
      monthly_salary_amount: amount,
      currency: form.currency.trim().toUpperCase(),
      effective_from: form.effective_from,
      change_type: form.change_type,
      reason: form.reason.trim(),
    });
  };

  const openComponentForm = (type: CompensationComponentType, component?: EmployeeCompensationComponent) => {
    setSuccessMessage(null);
    setLocalFieldErrors({});
    addComponentMutation.reset();
    changeComponentMutation.reset();
    setEditingComponent(component ?? null);
    setComponentForm(component ? {
      component_definition_id: component.component_definition_id ?? "",
      component_type: component.component_type,
      component_code: component.component_code ?? "",
      component_name: component.component_name,
      category: component.category ?? "",
      amount_major:
        component.calculation_type === "percentage_of_basic_salary"
          ? String(component.amount)
          : minorToMajor(component.amount),
      currency: component.currency ?? "MVR",
      calculation_type: component.calculation_type,
      affects_gross_pay: boolValue(component.affects_gross_pay),
      affects_net_pay: boolValue(component.affects_net_pay),
      effective_from: today(),
      reason: "",
      notes: component.notes ?? "",
    } : defaultComponentForm(type));
    setComponentFormOpen(true);
  };

  const applyDefinition = (definitionId: string) => {
    const definition = definitions.find((item: CompensationComponentDefinition) => item.id === definitionId);
    setComponentForm((current) => {
      if (!definition) return { ...current, component_definition_id: "" };
      return {
        ...current,
        component_definition_id: definition.id,
        component_type: definition.component_type,
        component_code: definition.component_code,
        component_name: definition.component_name,
        category: definition.category ?? "",
        amount_major:
          definition.calculation_type === "percentage_of_basic_salary"
            ? String(definition.default_amount ?? "")
            : minorToMajor(definition.default_amount ?? null),
        currency: definition.currency ?? "MVR",
        calculation_type: definition.calculation_type,
        affects_gross_pay: boolValue(definition.affects_gross_pay),
        affects_net_pay: boolValue(definition.affects_net_pay),
      };
    });
  };

  const componentPayloadFromForm = (): EmployeeCompensationComponentPayload | null => {
    const errors: Record<string, string> = {};
    const amount =
      componentForm.calculation_type === "percentage_of_basic_salary"
        ? Number(componentForm.amount_major)
        : majorToMinor(componentForm.amount_major);

    if (!componentForm.component_name.trim()) errors.component_name = "Component name is required.";
    if (!Number.isFinite(amount) || amount === null || amount <= 0) errors.amount = "Enter a positive amount or percentage.";
    if (!componentForm.effective_from) errors.effective_from = "Select an effective date.";
    if (!componentForm.reason.trim()) errors.reason = "Reason is required.";
    if (!componentForm.currency.trim()) errors.currency = "Currency is required.";

    setLocalFieldErrors(errors);
    if (Object.keys(errors).length > 0 || amount === null || !Number.isFinite(amount)) return null;

    return {
      component_definition_id: componentForm.component_definition_id || null,
      component_type: componentForm.component_type,
      component_code: componentForm.component_code.trim() || null,
      component_name: componentForm.component_name.trim(),
      category: componentForm.category.trim() || null,
      amount: Math.round(amount),
      currency: componentForm.currency.trim().toUpperCase(),
      calculation_type: componentForm.calculation_type,
      affects_gross_pay: componentForm.calculation_type === "non_cash_benefit" ? false : componentForm.affects_gross_pay,
      affects_net_pay: componentForm.calculation_type === "non_cash_benefit" ? false : componentForm.affects_net_pay,
      effective_from: componentForm.effective_from,
      reason: componentForm.reason.trim(),
      notes: componentForm.notes.trim() || null,
    };
  };

  const submitComponent = () => {
    const payload = componentPayloadFromForm();
    if (!payload) return;

    if (editingComponent) {
      changeComponentMutation.mutate({ componentId: editingComponent.id, payload });
    } else {
      addComponentMutation.mutate(payload);
    }
  };

  const endComponent = (component: EmployeeCompensationComponent) => {
    setEndingComponent(component);
    setEndForm({ effective_to: today(), reason: "" });
    setLocalFieldErrors({});
  };

  const submitEndComponent = () => {
    if (!endingComponent) return;
    const errors: Record<string, string> = {};
    if (!endForm.effective_to) errors.effective_to = "End date is required.";
    if (!endForm.reason.trim()) errors.reason = "Reason is required.";
    setLocalFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    endComponentMutation.mutate({
      componentId: endingComponent.id,
      effective_to: endForm.effective_to,
      reason: endForm.reason.trim(),
    }, {
      onSuccess: () => setEndingComponent(null),
    });
  };

  if (!canViewSalary) return null;

  if (query.isError) {
    return <InlineAlert title="Salary summary could not be loaded." variant="warning">Salary access may require additional permission.</InlineAlert>;
  }

  return (
    <div className="space-y-4">
      {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
      {!query.isLoading && history.length === 0 ? (
        <InlineAlert title="No salary record exists for this employee." variant="warning">
          Authorized users can add a starting salary before payroll calculations use this employee.
        </InlineAlert>
      ) : null}

      {summary ? (
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current compensation summary</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Estimated recurring compensation before variable payroll items.
              </p>
            </div>
            {canEditSalary ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openComponentForm("allowance")}>Add Allowance</Button>
                <Button size="sm" variant="outline" onClick={() => openComponentForm("benefit")}>Add Benefit</Button>
                <Button size="sm" variant="outline" onClick={() => openComponentForm("deduction")}>Add Deduction</Button>
              </div>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Basic salary", displayMoney(summary.basic_salary, summary.currency)],
              ["Recurring cash allowances", displayMoney(summary.recurring_cash_allowances, summary.currency)],
              ["Recurring cash benefits", displayMoney(summary.recurring_cash_benefits, summary.currency)],
              ["Gross additions", displayMoney(summary.recurring_gross_additions, summary.currency)],
              ["Gross deductions", displayMoney(summary.recurring_gross_deductions, summary.currency)],
              ["Net additions", displayMoney(summary.recurring_net_additions, summary.currency)],
              ["Net deductions", displayMoney(summary.recurring_net_deductions, summary.currency)],
              ["Recurring cash deductions", displayMoney(summary.recurring_cash_deductions, summary.currency)],
              ["Non-cash benefits", displayMoney(summary.non_cash_benefits, summary.currency)],
              ["Estimated recurring gross", displayMoney(summary.estimated_recurring_gross_pay, summary.currency)],
              ["Estimated recurring net before variable items", displayMoney(summary.estimated_recurring_net_before_variable_items, summary.currency)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : summaryQuery.isError ? (
        <InlineAlert title="Compensation summary could not be loaded." variant="warning">
          Compensation access may require additional permission.
        </InlineAlert>
      ) : null}

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current salary</p>
            <p className="mt-1 text-2xl font-semibold">
              {currentSalary ? displayMoney(currentSalary.monthly_salary_amount, currentSalary.currency ?? "MVR") : "Not recorded"}
            </p>
            {currentSalary ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Effective from {displayDate(currentSalary.effective_from)} - {formatChangeType(currentSalary.change_type)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Payroll will require salary history before this employee can be calculated safely.</p>
            )}
          </div>
          {canEditSalary ? <Button onClick={openSalaryForm}>Add Salary Change</Button> : null}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <h4 className="text-sm font-semibold">Active Compensation Components</h4>
          <p className="text-xs text-muted-foreground">Recurring allowances, benefits, and deductions that may apply to future payroll periods.</p>
        </div>
        <DataTable<EmployeeCompensationComponent>
          compact
          loading={componentsQuery.isLoading}
          columns={[
            { key: "component_name", header: "Component", cell: (row) => row.component_name },
            { key: "component_type", header: "Type", cell: (row) => formatComponentType(row.component_type) },
            { key: "calculation_type", header: "Calculation", cell: (row) => formatCalculationType(row.calculation_type) },
            { key: "amount", header: "Amount / Value", cell: (row) => formatComponentAmount(row) },
            { key: "effective_from", header: "Effective From", cell: (row) => displayDate(row.effective_from) },
            { key: "effective_to", header: "Effective To", cell: (row) => row.effective_to ? displayDate(row.effective_to) : "Open" },
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.effective_status ?? row.status ?? "active"} /> },
            {
              key: "cash_payroll_component",
              header: "Payroll Cash",
              cell: (row) => row.calculation_type === "non_cash_benefit" ? "Non-cash" : boolValue(row.affects_net_pay) || boolValue(row.affects_gross_pay) ? "Yes" : "No",
            },
          ]}
          rows={activeComponents}
          getRowId={(row) => row.id}
          emptyTitle="No active compensation components."
          emptyDescription="Recurring allowances, benefits, and deductions will appear here."
          rowActions={canEditSalary ? (row) => (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => openComponentForm(row.component_type, row)}>
                Change
              </Button>
              <Button size="sm" variant="outline" onClick={() => endComponent(row)} disabled={endComponentMutation.isPending}>
                End
              </Button>
            </div>
          ) : undefined}
        />
      </div>

      <DataTable
        compact
        loading={query.isLoading}
        columns={[
          { key: "effective_from", header: "Effective From", cell: (row) => displayDate(row.effective_from) },
          { key: "effective_to", header: "Effective To", cell: (row) => row.effective_to ? displayDate(row.effective_to) : "Current" },
          { key: "monthly_salary_amount", header: "Monthly Salary", cell: (row) => displayMoney(row.monthly_salary_amount, row.currency ?? "MVR") },
          { key: "currency", header: "Currency", cell: (row) => row.currency ?? "MVR" },
          { key: "change_type", header: "Change Type", cell: (row) => formatChangeType(row.change_type) },
          { key: "reason", header: "Reason", cell: (row) => row.reason ?? "Not recorded" },
          { key: "created_by_name", header: "Created By", cell: (row) => row.created_by_name ?? row.created_by ?? "System" },
          { key: "created_at", header: "Created At", cell: (row) => displayDate(row.created_at) },
        ]}
        rows={history}
        getRowId={(row) => row.id}
        emptyTitle="No salary history found."
        emptyDescription="Add a starting salary before payroll uses this employee."
      />

      <div className="space-y-2">
        <div>
          <h4 className="text-sm font-semibold">Compensation History</h4>
          <p className="text-xs text-muted-foreground">Ended or replaced recurring compensation records are preserved for audit and payroll history.</p>
        </div>
        <DataTable<EmployeeCompensationComponent>
          compact
          loading={componentsQuery.isLoading}
          columns={[
            { key: "component_name", header: "Component", cell: (row) => row.component_name },
            { key: "component_type", header: "Type", cell: (row) => formatComponentType(row.component_type) },
            { key: "amount", header: "Amount / Value", cell: (row) => formatComponentAmount(row) },
            { key: "effective_from", header: "Effective From", cell: (row) => displayDate(row.effective_from) },
            { key: "effective_to", header: "Effective To", cell: (row) => row.effective_to ? displayDate(row.effective_to) : "Open" },
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.effective_status ?? row.status ?? "ended"} /> },
            { key: "reason", header: "Reason", cell: (row) => row.reason ?? "Not recorded" },
          ]}
          rows={historicalComponents}
          getRowId={(row) => row.id}
          emptyTitle="No compensation history found."
          emptyDescription="Changed or ended components will appear here without overwriting old records."
        />
      </div>
      {canViewApprovals ? (
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold">Pending Salary Changes</h4>
            <p className="text-xs text-muted-foreground">Pending approvals do not replace the current salary until they are approved.</p>
          </div>
          <DataTable<ApprovalRequest>
            compact
            loading={pendingQuery.isLoading}
            columns={[
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> },
            { key: "type", header: "Type", cell: (row) => row.entity_type ?? row.workflow_key ?? "salary_change" },
            {
              key: "proposed_salary",
              header: "Proposed Salary",
              cell: (row) => {
                const proposed = proposedSalary(row);
                const amount = typeof proposed.monthly_salary_amount === "number" ? proposed.monthly_salary_amount : null;
                const currency = typeof proposed.currency === "string" ? proposed.currency : "MVR";
                return amount !== null ? displayMoney(amount, currency) : "Not recorded";
              },
            },
            {
              key: "effective_from",
              header: "Effective From",
              cell: (row) => {
                const proposed = proposedSalary(row);
                return displayDate(typeof proposed.effective_from === "string" ? proposed.effective_from : row.created_at);
              },
            },
            {
              key: "reason",
              header: "Reason",
              cell: (row) => {
                const proposed = proposedSalary(row);
                return typeof proposed.reason === "string" ? proposed.reason : row.summary ?? "Not recorded";
              },
            },
            { key: "requested_by_name", header: "Requested By", cell: (row) => row.requested_by_name ?? row.requested_by ?? "Not recorded" },
            { key: "created_at", header: "Requested At", cell: (row) => displayDate(row.created_at) },
            {
              key: "actions",
              header: "Actions",
              cell: (row) => row.can_cancel ? (
                <Button size="sm" variant="outline" onClick={() => cancelApproval(row)} disabled={cancelApprovalMutation.isPending}>
                  Cancel
                </Button>
              ) : "No actions",
            },
            ]}
            rows={pendingSalaryApprovals}
            getRowId={(row) => row.id}
            emptyTitle="No pending salary changes."
            emptyDescription="Salary approval requests will appear here until they are approved or rejected."
          />
        </div>
      ) : null}

      {canViewApprovals ? (
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold">Pending Compensation Changes</h4>
            <p className="text-xs text-muted-foreground">Pending component approvals do not affect summaries or payroll helpers until approved.</p>
          </div>
          <DataTable<ApprovalRequest>
            compact
            loading={pendingQuery.isLoading}
            columns={[
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> },
              { key: "type", header: "Action", cell: (row) => row.entity_type?.replace("compensation_component_", "") ?? "component_change" },
              { key: "component", header: "Component", cell: (row) => String(proposedCompensationComponent(row).component_name ?? "Not recorded") },
              {
                key: "amount",
                header: "Value",
                cell: (row) => {
                  const proposed = proposedCompensationComponent(row);
                  const amount = typeof proposed.amount === "number" ? proposed.amount : null;
                  const currency = typeof proposed.currency === "string" ? proposed.currency : "MVR";
                  return amount !== null ? displayMoney(amount, currency) : "Not recorded";
                },
              },
              {
                key: "effective",
                header: "Effective",
                cell: (row) => {
                  const proposed = proposedCompensationComponent(row);
                  const ending = endingCompensationComponent(row);
                  return displayDate(
                    typeof proposed.effective_from === "string"
                      ? proposed.effective_from
                      : typeof ending.effective_to === "string"
                        ? ending.effective_to
                        : row.created_at,
                  );
                },
              },
              {
                key: "reason",
                header: "Reason",
                cell: (row) => {
                  const proposed = proposedCompensationComponent(row);
                  const ending = endingCompensationComponent(row);
                  return String(proposed.reason ?? ending.reason ?? row.summary ?? "Not recorded");
                },
              },
              { key: "requested_by_name", header: "Requested By", cell: (row) => row.requested_by_name ?? row.requested_by ?? "Not recorded" },
              {
                key: "actions",
                header: "Actions",
                cell: (row) => row.can_cancel ? (
                  <Button size="sm" variant="outline" onClick={() => cancelApproval(row)} disabled={cancelApprovalMutation.isPending}>
                    Cancel
                  </Button>
                ) : "No actions",
              },
            ]}
            rows={pendingCompensationApprovals}
            getRowId={(row) => row.id}
            emptyTitle="No pending compensation changes."
            emptyDescription="Allowance, benefit, and deduction approval requests will appear here."
          />
        </div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add salary change</DialogTitle>
            <DialogDescription>This creates a new salary history record and preserves previous salary records for payroll audit history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <InlineAlert title="Previous salary records will be preserved." variant="info">
              The previous active salary will end the day before this effective date.
            </InlineAlert>
            <InlineAlert title="Salary changes may require approval before becoming active." variant="info">
              If approval is required, the proposed salary will appear as pending and current salary will remain unchanged until approval.
            </InlineAlert>
            {currentSalary ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Current salary: {displayMoney(currentSalary.monthly_salary_amount, currentSalary.currency ?? "MVR")}</p>
                {salaryDifference !== null ? (
                  <p className="mt-1 text-muted-foreground">
                    Difference: {salaryDifference >= 0 ? "+" : ""}
                    {displayMoney(salaryDifference, form.currency || currentSalary.currency || "MVR")}
                  </p>
                ) : null}
              </div>
            ) : null}
            <Label className="space-y-1">
              <span>Monthly salary amount</span>
              <Input
                inputMode="decimal"
                placeholder="7500"
                value={form.monthly_salary_major}
                onChange={(event) => setForm((current) => ({ ...current, monthly_salary_major: event.target.value }))}
              />
              <span className="block text-xs text-muted-foreground">Enter the user-friendly amount. The API stores it as integer minor units.</span>
              {fieldError("monthly_salary_amount") ? <span className="block text-xs text-red-600">{fieldError("monthly_salary_amount")}</span> : null}
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="space-y-1">
                <span>Currency</span>
                <Input value={form.currency} maxLength={3} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
                {fieldError("currency") ? <span className="block text-xs text-red-600">{fieldError("currency")}</span> : null}
              </Label>
              <div className="space-y-1">
                <AppDatePicker label="Effective from" value={form.effective_from} onChange={(value) => setForm((current) => ({ ...current, effective_from: value ?? "" }))} />
                {fieldError("effective_from") ? <span className="block text-xs text-red-600">{fieldError("effective_from")}</span> : null}
              </div>
            </div>
            <Label className="space-y-1">
              <span>Change type</span>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.change_type}
                onChange={(event) => setForm((current) => ({ ...current, change_type: event.target.value as EmployeeSalaryChangePayload["change_type"] }))}
              >
                {Object.entries(changeTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {fieldError("change_type") ? <span className="block text-xs text-red-600">{fieldError("change_type")}</span> : null}
            </Label>
            <Label className="space-y-1">
              <span>Reason</span>
              <Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
              {fieldError("reason") ? <span className="block text-xs text-red-600">{fieldError("reason")}</span> : null}
            </Label>
            <FormError error={apiError} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <LoadingButton loading={addSalaryMutation.isPending} onClick={submitSalaryChange}>Save salary change</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={componentFormOpen} onOpenChange={setComponentFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingComponent ? "Change compensation component" : `Add ${formatComponentType(componentForm.component_type)}`}</DialogTitle>
            <DialogDescription>
              Changes create a new effective-dated compensation record and preserve the previous history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <InlineAlert title="This is not final payroll net." variant="info">
              Recurring compensation excludes attendance deductions, unpaid leave, overtime, bonuses, advances, salary loans, and one-time payroll adjustments.
            </InlineAlert>
            {componentForm.calculation_type === "percentage_of_basic_salary" && currentSalary ? (
              <InlineAlert title="Percentage preview" variant="info">
                {componentForm.amount_major || "0"}% of {displayMoney(currentSalary.monthly_salary_amount, currentSalary.currency ?? "MVR")} is approximately{" "}
                {displayMoney(Math.round((currentSalary.monthly_salary_amount * Number(componentForm.amount_major || 0)) / 100), currentSalary.currency ?? "MVR")}.
              </InlineAlert>
            ) : null}
            {componentForm.calculation_type === "non_cash_benefit" ? (
              <InlineAlert title="Non-cash benefit" variant="warning">
                This benefit is tracked for HR visibility but does not increase payable cash salary.
              </InlineAlert>
            ) : null}
            <Label className="space-y-1">
              <span>Component definition</span>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={componentForm.component_definition_id}
                onChange={(event) => applyDefinition(event.target.value)}
              >
                <option value="">Custom component</option>
                {definitions.map((definition: CompensationComponentDefinition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.component_name} ({definition.component_code})
                  </option>
                ))}
              </select>
              <span className="block text-xs text-muted-foreground">Choose a standard company component or keep custom if authorized.</span>
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="space-y-1">
                <span>Component type</span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={componentForm.component_type}
                  onChange={(event) => {
                    const type = event.target.value as CompensationComponentType;
                    setComponentForm((current) => ({
                      ...current,
                      component_type: type,
                      calculation_type: type === "benefit" ? "non_cash_benefit" : "fixed_amount",
                      affects_gross_pay: type === "allowance",
                      affects_net_pay: type !== "benefit",
                    }));
                  }}
                >
                  {Object.entries(componentTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {fieldError("component_type") ? <span className="block text-xs text-red-600">{fieldError("component_type")}</span> : null}
              </Label>
              <Label className="space-y-1">
                <span>Calculation type</span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={componentForm.calculation_type}
                  onChange={(event) => {
                    const calculationType = event.target.value as CompensationCalculationType;
                    setComponentForm((current) => ({
                      ...current,
                      calculation_type: calculationType,
                      affects_gross_pay: calculationType === "non_cash_benefit" ? false : current.affects_gross_pay,
                      affects_net_pay: calculationType === "non_cash_benefit" ? false : current.affects_net_pay,
                    }));
                  }}
                >
                  {Object.entries(calculationTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {fieldError("calculation_type") ? <span className="block text-xs text-red-600">{fieldError("calculation_type")}</span> : null}
              </Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="space-y-1">
                <span>Component name</span>
                <Input value={componentForm.component_name} onChange={(event) => setComponentForm((current) => ({ ...current, component_name: event.target.value }))} />
                {fieldError("component_name") ? <span className="block text-xs text-red-600">{fieldError("component_name")}</span> : null}
              </Label>
              <Label className="space-y-1">
                <span>Code</span>
                <Input value={componentForm.component_code} onChange={(event) => setComponentForm((current) => ({ ...current, component_code: event.target.value.toUpperCase() }))} />
              </Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Label className="space-y-1">
                <span>{componentForm.calculation_type === "percentage_of_basic_salary" ? "Percentage" : "Amount"}</span>
                <Input
                  inputMode="decimal"
                  value={componentForm.amount_major}
                  onChange={(event) => setComponentForm((current) => ({ ...current, amount_major: event.target.value }))}
                />
                {fieldError("amount") ? <span className="block text-xs text-red-600">{fieldError("amount")}</span> : null}
              </Label>
              <Label className="space-y-1">
                <span>Currency</span>
                <Input value={componentForm.currency} maxLength={3} onChange={(event) => setComponentForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
                {fieldError("currency") ? <span className="block text-xs text-red-600">{fieldError("currency")}</span> : null}
              </Label>
              <div className="space-y-1">
                <AppDatePicker label="Effective from" value={componentForm.effective_from} onChange={(value) => setComponentForm((current) => ({ ...current, effective_from: value ?? "" }))} />
                {fieldError("effective_from") ? <span className="block text-xs text-red-600">{fieldError("effective_from")}</span> : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={componentForm.affects_gross_pay}
                  disabled={componentForm.calculation_type === "non_cash_benefit"}
                  onChange={(event) => setComponentForm((current) => ({ ...current, affects_gross_pay: event.target.checked }))}
                />
                Affects gross pay
              </Label>
              <Label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={componentForm.affects_net_pay}
                  disabled={componentForm.calculation_type === "non_cash_benefit"}
                  onChange={(event) => setComponentForm((current) => ({ ...current, affects_net_pay: event.target.checked }))}
                />
                Affects net pay
              </Label>
            </div>
            <Label className="space-y-1">
              <span>Reason</span>
              <Textarea value={componentForm.reason} onChange={(event) => setComponentForm((current) => ({ ...current, reason: event.target.value }))} />
              {fieldError("reason") ? <span className="block text-xs text-red-600">{fieldError("reason")}</span> : null}
            </Label>
            <Label className="space-y-1">
              <span>Notes</span>
              <Textarea value={componentForm.notes} onChange={(event) => setComponentForm((current) => ({ ...current, notes: event.target.value }))} />
            </Label>
            <FormError error={componentApiError} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComponentFormOpen(false)}>Cancel</Button>
            <LoadingButton loading={addComponentMutation.isPending || changeComponentMutation.isPending} onClick={submitComponent}>
              {editingComponent ? "Save component change" : "Add component"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(endingComponent)} onOpenChange={(open) => !open && setEndingComponent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End compensation component</DialogTitle>
            <DialogDescription>
              This preserves the component history and stops it after the selected effective end date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {endingComponent ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">{endingComponent.component_name}</p>
                <p className="mt-1 text-muted-foreground">
                  {formatComponentType(endingComponent.component_type)} - {formatComponentAmount(endingComponent)}
                </p>
              </div>
            ) : null}
            <InlineAlert title="History will be preserved." variant="info">
              Future-dated endings keep the component active until the effective end date.
            </InlineAlert>
            <div className="space-y-1">
              <AppDatePicker label="Effective end date" value={endForm.effective_to} onChange={(value) => setEndForm((current) => ({ ...current, effective_to: value ?? "" }))} />
              {fieldError("effective_to") ? <span className="block text-xs text-red-600">{fieldError("effective_to")}</span> : null}
            </div>
            <Label className="space-y-1">
              <span>Reason</span>
              <Textarea value={endForm.reason} onChange={(event) => setEndForm((current) => ({ ...current, reason: event.target.value }))} />
              {fieldError("reason") ? <span className="block text-xs text-red-600">{fieldError("reason")}</span> : null}
            </Label>
            <FormError error={componentApiError} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndingComponent(null)}>Cancel</Button>
            <LoadingButton loading={endComponentMutation.isPending} onClick={submitEndComponent}>End component</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={Boolean(cancelApprovalTarget)}
        title="Cancel salary approval request"
        description="A reason is required before cancelling this salary or compensation approval request."
        confirmLabel="Cancel approval request"
        loading={cancelApprovalMutation.isPending}
        onOpenChange={(open) => { if (!open) setCancelApprovalTarget(null); }}
        onSubmit={(reason) => {
          if (!cancelApprovalTarget) return;
          cancelApprovalMutation.mutate({ id: cancelApprovalTarget.id, reason });
          setCancelApprovalTarget(null);
        }}
      />
    </div>
  );
};
