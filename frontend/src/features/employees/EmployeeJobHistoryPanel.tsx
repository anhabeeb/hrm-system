import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { FormError } from "@/components/feedback/FormError";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { DepartmentCombobox, OutletCombobox, PositionCombobox } from "@/components/selectors";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approvalsApi } from "@/features/approvals/approvals.api";
import type { ApprovalRequest } from "@/features/approvals/approvals.types";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";
import { displayDate, displayMoney } from "./employee-format";
import { employeesApi } from "./employees.api";
import type { Employee, EmployeeJobChangePayload, EmployeeJobChangeType, EmployeeJobHistoryRow, EmployeeSalaryRow } from "./employees.types";

const today = () => new Date().toISOString().slice(0, 10);

const changeTypeLabels: Record<EmployeeJobChangeType, string> = {
  promotion: "Promotion",
  transfer: "Transfer",
  department_change: "Department change",
  position_change: "Position change",
  outlet_change: "Outlet change",
  correction: "Correction",
  other: "Other",
};

const majorToMinor = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

const findCurrentSalary = (history: EmployeeSalaryRow[]) =>
  history.find((row) => !row.effective_to) ?? history[0] ?? null;

const formatChangeType = (value?: string | null) =>
  value && value in changeTypeLabels ? changeTypeLabels[value as EmployeeJobChangeType] : value ?? "Not recorded";

const readable = (name?: string | null, id?: string | null) => name ?? id ?? "Not assigned";

const jobApprovalPayload = (approval: ApprovalRequest) =>
  (approval.payload_json ?? approval.payload_summary ?? {}) as Record<string, unknown>;

const proposedJobChange = (approval: ApprovalRequest) => {
  const payload = jobApprovalPayload(approval);
  return (payload.job_change ?? {}) as Record<string, unknown>;
};

interface EmployeeJobHistoryPanelProps {
  employee: Employee;
  canManageJobChange: boolean;
  canViewSalary: boolean;
  canEditSalary: boolean;
}

export const EmployeeJobHistoryPanel = ({
  employee,
  canManageJobChange,
  canViewSalary,
  canEditSalary,
}: EmployeeJobHistoryPanelProps) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localFieldErrors, setLocalFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    change_type: "promotion" as EmployeeJobChangeType,
    effective_from: today(),
    new_outlet_id: employee.primary_outlet_id ?? "",
    new_department_id: employee.department_id ?? "",
    new_position_id: employee.position_id ?? "",
    reason: "",
    update_salary: false,
    salary_major: "",
    salary_currency: "MVR",
    salary_reason: "",
  });

  const jobHistoryQuery = useQuery({
    queryKey: ["employee-job-history", employee.id],
    queryFn: () => employeesApi.jobHistory(employee.id),
  });
  const salaryQuery = useQuery({
    queryKey: ["employee-salary-history", employee.id],
    queryFn: () => employeesApi.salaryHistory(employee.id),
    enabled: canViewSalary || canEditSalary,
  });
  const canViewApprovals = auth.isSuperAdmin || auth.hasPermission("approvals.view");
  const pendingQuery = useQuery({
    queryKey: ["employee-job-salary-approvals", employee.id],
    queryFn: () => approvalsApi.list({
      module: "salary",
      entity_type: "promotion_with_salary_change",
      employee_id: employee.id,
      page: 1,
      page_size: 10,
    }),
    enabled: canViewApprovals,
    retry: false,
  });
  const currentSalary = useMemo(
    () => findCurrentSalary(salaryQuery.data?.data.history ?? []),
    [salaryQuery.data?.data.history],
  );
  const newSalaryMinor = majorToMinor(form.salary_major);
  const salaryDifference = currentSalary && newSalaryMinor !== null ? newSalaryMinor - currentSalary.monthly_salary_amount : null;

  const mutation = useMutation({
    mutationFn: (payload: EmployeeJobChangePayload) => employeesApi.createJobChange(employee.id, payload),
    onSuccess: async (response) => {
      setSuccessMessage(response.message ?? "Job change recorded successfully.");
      setFormOpen(false);
      setLocalFieldErrors({});
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.invalidateQueries({ queryKey: ["employee-job-history", employee.id] });
      await queryClient.invalidateQueries({ queryKey: ["employee-salary-history", employee.id] });
      await queryClient.invalidateQueries({ queryKey: ["employee-job-salary-approvals", employee.id] });
    },
  });
  const cancelApprovalMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => approvalsApi.cancel(id, reason),
    onSuccess: async (response) => {
      setSuccessMessage(response.message ?? "Approval request cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["employee-job-salary-approvals", employee.id] });
    },
  });
  const cancelApproval = (approval: ApprovalRequest) => {
    const reason = window.prompt("Enter a reason for cancelling this promotion approval request.");
    if (!reason?.trim()) return;
    cancelApprovalMutation.mutate({ id: approval.id, reason: reason.trim() });
  };
  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  const fieldError = (field: string) => localFieldErrors[field] ?? apiError?.fieldErrors?.[field];

  const openForm = () => {
    mutation.reset();
    setSuccessMessage(null);
    setLocalFieldErrors({});
    setForm({
      change_type: "promotion",
      effective_from: today(),
      new_outlet_id: employee.primary_outlet_id ?? "",
      new_department_id: employee.department_id ?? "",
      new_position_id: employee.position_id ?? "",
      reason: "",
      update_salary: false,
      salary_major: currentSalary ? (currentSalary.monthly_salary_amount / 100).toFixed(2).replace(/\.00$/, "") : "",
      salary_currency: currentSalary?.currency ?? "MVR",
      salary_reason: "",
    });
    setFormOpen(true);
  };

  const submit = () => {
    const errors: Record<string, string> = {};
    const jobChanged =
      (form.new_outlet_id || null) !== (employee.primary_outlet_id ?? null) ||
      (form.new_department_id || null) !== (employee.department_id ?? null) ||
      (form.new_position_id || null) !== (employee.position_id ?? null);

    if (!form.change_type) errors.change_type = "Select a job change type.";
    if (!form.effective_from) errors.effective_from = "Select an effective date.";
    if (!form.reason.trim()) errors.reason = "Reason is required.";
    if (!jobChanged && form.change_type !== "correction") errors.change = "Choose at least one changed job field.";
    if (form.update_salary && !canEditSalary) errors.salary_change = "You do not have permission to update salary history.";
    if (form.update_salary && majorToMinor(form.salary_major) === null) errors["salary_change.monthly_salary_amount"] = "Enter a positive salary amount.";

    setLocalFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    mutation.mutate({
      change_type: form.change_type,
      effective_from: form.effective_from,
      new_outlet_id: form.new_outlet_id || null,
      new_department_id: form.new_department_id || null,
      new_position_id: form.new_position_id || null,
      reason: form.reason.trim(),
      salary_change: form.update_salary && newSalaryMinor !== null
        ? {
            enabled: true,
            monthly_salary_amount: newSalaryMinor,
            currency: form.salary_currency.trim().toUpperCase() || "MVR",
            change_type: form.change_type === "promotion" ? "promotion" : "contract_change",
            reason: form.salary_reason.trim() || form.reason.trim(),
          }
        : { enabled: false },
    });
  };

  return (
    <div className="space-y-4">
      {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
      {jobHistoryQuery.isError ? <InlineAlert title="Job history could not be loaded." variant="warning" /> : null}

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current employment</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="font-medium">Outlet:</span> {readable(employee.primary_outlet_name, employee.primary_outlet_id)}</p>
              <p><span className="font-medium">Department:</span> {readable(employee.department_name, employee.department_id)}</p>
              <p><span className="font-medium">Position:</span> {readable(employee.position_title, employee.position_id)}</p>
              <p><span className="font-medium">Joined:</span> {displayDate(employee.joined_at)}</p>
              <p><span className="font-medium">Employment status:</span> {employee.employment_status}</p>
            </div>
          </div>
          {canManageJobChange ? <Button onClick={openForm}>Add Job Change / Promote Employee</Button> : null}
        </div>
      </div>

      <DataTable<EmployeeJobHistoryRow>
        compact
        loading={jobHistoryQuery.isLoading}
        rows={jobHistoryQuery.data?.data.history ?? []}
        getRowId={(row) => row.id}
        emptyTitle="No job history found."
        emptyDescription="Job changes and promotions will appear here after they are recorded."
        columns={[
          { key: "effective_from", header: "Effective From", cell: (row) => displayDate(row.effective_from) },
          { key: "change_type", header: "Change Type", cell: (row) => formatChangeType(row.change_type) },
          { key: "old_position_title", header: "Old Position", cell: (row) => readable(row.old_position_title, row.old_position_id) },
          { key: "new_position_title", header: "New Position", cell: (row) => readable(row.new_position_title, row.new_position_id) },
          { key: "old_department_name", header: "Old Department", cell: (row) => readable(row.old_department_name, row.old_department_id) },
          { key: "new_department_name", header: "New Department", cell: (row) => readable(row.new_department_name, row.new_department_id) },
          { key: "old_outlet_name", header: "Old Outlet", cell: (row) => readable(row.old_outlet_name, row.old_outlet_id) },
          { key: "new_outlet_name", header: "New Outlet", cell: (row) => readable(row.new_outlet_name, row.new_outlet_id) },
          { key: "reason", header: "Reason", cell: (row) => row.reason ?? "Not recorded" },
          { key: "created_by_name", header: "Created By", cell: (row) => row.created_by_name ?? row.created_by ?? "System" },
          { key: "created_at", header: "Created At", cell: (row) => displayDate(row.created_at) },
        ]}
      />
      {canViewApprovals ? (
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold">Pending Job/Promotion Changes</h4>
            <p className="text-xs text-muted-foreground">Promotions with salary changes remain pending until approval.</p>
          </div>
          <DataTable<ApprovalRequest>
            compact
            loading={pendingQuery.isLoading}
            rows={(pendingQuery.data?.data ?? []).filter((row) => ["pending", "in_progress", "failed", "returned", "returned_for_more_info"].includes(row.status ?? "pending"))}
            getRowId={(row) => row.id}
            emptyTitle="No pending job or promotion changes."
            emptyDescription="Promotions with salary changes remain pending here until approval."
            columns={[
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> },
            {
              key: "change_type",
              header: "Change Type",
              cell: (row) => {
                const proposed = proposedJobChange(row);
                return formatChangeType(typeof proposed.change_type === "string" ? proposed.change_type : row.entity_type);
              },
            },
            {
              key: "effective_from",
              header: "Effective From",
              cell: (row) => {
                const proposed = proposedJobChange(row);
                return displayDate(typeof proposed.effective_from === "string" ? proposed.effective_from : row.created_at);
              },
            },
            {
              key: "new_position",
              header: "Proposed Position",
              cell: (row) => {
                const proposed = proposedJobChange(row);
                return readable(null, typeof proposed.new_position_id === "string" ? proposed.new_position_id : null);
              },
            },
            {
              key: "salary",
              header: "Proposed Salary",
              cell: (row) => {
                const proposed = proposedJobChange(row);
                const salary = proposed.salary_change as Record<string, unknown> | undefined;
                const amount = typeof salary?.monthly_salary_amount === "number" ? salary.monthly_salary_amount : null;
                const currency = typeof salary?.currency === "string" ? salary.currency : "MVR";
                return amount !== null ? displayMoney(amount, currency) : "Not included";
              },
            },
            {
              key: "reason",
              header: "Reason",
              cell: (row) => {
                const proposed = proposedJobChange(row);
                return typeof proposed.reason === "string" ? proposed.reason : row.summary ?? "Not recorded";
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
          />
        </div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add job change or promotion</DialogTitle>
            <DialogDescription>Record a promotion, transfer, or job change while preserving existing employment history.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <InlineAlert title="Existing history will be preserved." variant="info">
              This will create a job history record. It will not overwrite old job or salary history.
            </InlineAlert>
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Current values</p>
              <p className="mt-1 text-muted-foreground">
                {readable(employee.primary_outlet_name, employee.primary_outlet_id)} / {readable(employee.department_name, employee.department_id)} / {readable(employee.position_title, employee.position_id)}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="space-y-1">
                <span>Change type</span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.change_type}
                  onChange={(event) => setForm((current) => ({ ...current, change_type: event.target.value as EmployeeJobChangeType }))}
                >
                  {Object.entries(changeTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {fieldError("change_type") ? <span className="block text-xs text-red-600">{fieldError("change_type")}</span> : null}
              </Label>
              <Label className="space-y-1">
                <span>Effective from</span>
                <Input type="date" value={form.effective_from} onChange={(event) => setForm((current) => ({ ...current, effective_from: event.target.value }))} />
                {fieldError("effective_from") ? <span className="block text-xs text-red-600">{fieldError("effective_from")}</span> : null}
              </Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Label className="space-y-1">
                <span>New outlet</span>
                <OutletCombobox value={form.new_outlet_id} onChange={(value) => setForm((current) => ({ ...current, new_outlet_id: value ?? "" }))} />
                {fieldError("new_outlet_id") ? <span className="block text-xs text-red-600">{fieldError("new_outlet_id")}</span> : null}
              </Label>
              <Label className="space-y-1">
                <span>New department</span>
                <DepartmentCombobox value={form.new_department_id} onChange={(value) => setForm((current) => ({ ...current, new_department_id: value ?? "" }))} placeholder="No department" />
                {fieldError("new_department_id") ? <span className="block text-xs text-red-600">{fieldError("new_department_id")}</span> : null}
              </Label>
              <Label className="space-y-1">
                <span>New position</span>
                <PositionCombobox value={form.new_position_id} departmentId={form.new_department_id || null} onChange={(value) => setForm((current) => ({ ...current, new_position_id: value ?? "" }))} placeholder="No position" />
                {fieldError("new_position_id") ? <span className="block text-xs text-red-600">{fieldError("new_position_id")}</span> : null}
              </Label>
            </div>
            {fieldError("change") ? <span className="block text-xs text-red-600">{fieldError("change")}</span> : null}
            <Label className="space-y-1">
              <span>Reason</span>
              <Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
              {fieldError("reason") ? <span className="block text-xs text-red-600">{fieldError("reason")}</span> : null}
            </Label>
            {canEditSalary ? (
              <div className="space-y-3 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={form.update_salary} onCheckedChange={(checked) => setForm((current) => ({ ...current, update_salary: checked === true }))} />
                  Update salary with this job change
                </label>
                {form.update_salary ? (
                  <div className="space-y-3">
                    <InlineAlert title="This promotion includes a salary change and may require approval." variant="info">
                      If approval is required, the employee job and salary details will remain unchanged until the request is approved.
                    </InlineAlert>
                    <p className="text-sm text-muted-foreground">
                      Current salary: {currentSalary ? displayMoney(currentSalary.monthly_salary_amount, currentSalary.currency ?? "MVR") : "Not recorded"}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Label className="space-y-1">
                        <span>New salary amount</span>
                        <Input inputMode="decimal" value={form.salary_major} onChange={(event) => setForm((current) => ({ ...current, salary_major: event.target.value }))} />
                        <span className="block text-xs text-muted-foreground">Enter MVR in major units; the API stores integer minor units.</span>
                        {fieldError("salary_change.monthly_salary_amount") ? <span className="block text-xs text-red-600">{fieldError("salary_change.monthly_salary_amount")}</span> : null}
                      </Label>
                      <Label className="space-y-1">
                        <span>Currency</span>
                        <Input value={form.salary_currency} maxLength={3} onChange={(event) => setForm((current) => ({ ...current, salary_currency: event.target.value.toUpperCase() }))} />
                      </Label>
                    </div>
                    {salaryDifference !== null ? <p className="text-sm text-muted-foreground">Difference: {salaryDifference >= 0 ? "+" : ""}{displayMoney(salaryDifference, form.salary_currency || "MVR")}</p> : null}
                    <Label className="space-y-1">
                      <span>Salary reason</span>
                      <Textarea value={form.salary_reason} onChange={(event) => setForm((current) => ({ ...current, salary_reason: event.target.value }))} placeholder="Defaults to job change reason" />
                    </Label>
                  </div>
                ) : null}
              </div>
            ) : null}
            <FormError error={apiError} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <LoadingButton loading={mutation.isPending} onClick={submit}>Save job change</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
