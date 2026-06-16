import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, Play, RotateCcw, ShieldOff } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoneyMinor } from "@/lib/format";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { displayDate } from "@/features/employees/employee-format";
import type { Employee } from "@/features/employees/employees.types";
import { offboardingApi } from "./offboarding.api";
import type { OffboardingCaseDetail, OffboardingTask, OffboardingType, StartOffboardingPayload } from "./offboarding.types";

const today = () => new Date().toISOString().slice(0, 10);

const label = (value?: string | null) => value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not recorded";

const taskProgress = (detail?: OffboardingCaseDetail | null) => {
  const tasks = detail?.tasks ?? [];
  if (tasks.length === 0) return "No checklist tasks yet";
  const done = tasks.filter((task) => ["completed", "waived"].includes(task.status)).length;
  return `${done}/${tasks.length} tasks cleared`;
};

const employeeExitDate = (employee: Employee) => {
  const row = employee as Employee & { terminated_at?: string | null; resigned_at?: string | null };
  return row.terminated_at ?? row.resigned_at ?? today();
};

const SettlementPreview = ({ detail }: { detail?: OffboardingCaseDetail | null }) => {
  const draft = detail?.settlement_draft;
  if (!draft) {
    return (
      <InlineAlert title="Final settlement draft is not prepared yet.">
        Prepare a draft to review salary due, outstanding advances, loans, and deductions before payroll finalization.
      </InlineAlert>
    );
  }
  const currency = draft.currency ?? "MVR";
  const rows = [
    ["Basic salary due", draft.basic_salary_due],
    ["Allowances due", draft.allowances_due],
    ["Unpaid leave deductions", -draft.unpaid_leave_deductions],
    ["Attendance deductions", -draft.attendance_deductions],
    ["Outstanding advances", -draft.advances_outstanding],
    ["Outstanding loans", -draft.loans_outstanding],
    ["Asset deductions", -draft.asset_deductions],
    ["Estimated net settlement", draft.estimated_net_settlement],
  ];
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Final Settlement Draft</h4>
          <p className="text-xs text-muted-foreground">Preparation only. Payroll finalization still controls actual payment and repayment marking.</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-xs">{displayDate(draft.period_start)} to {displayDate(draft.period_end)}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map(([name, amount]) => (
          <div key={String(name)} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
            <span>{name}</span>
            <span className="font-medium">{formatMoneyMinor(Number(amount), currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const OffboardingPanel = ({
  employee,
  canManage,
}: {
  employee: Employee;
  canManage: boolean;
}) => {
  const queryClient = useQueryClient();
  const [startOpen, setStartOpen] = useState(false);
  const [action, setAction] = useState<{ type: "complete" | "waive"; task: OffboardingTask } | null>(null);
  const [reason, setReason] = useState("");
  const [startForm, setStartForm] = useState<StartOffboardingPayload>({
    offboarding_type: "resignation",
    effective_exit_date: employeeExitDate(employee),
    reason: "",
    notes: "",
    create_default_tasks: true,
  });

  useEffect(() => {
    if (startOpen) {
      setStartForm({
        offboarding_type: employee.employment_status === "terminated" ? "termination" : employee.employment_status === "retired" ? "retirement" : "resignation",
        effective_exit_date: employeeExitDate(employee),
        reason: "",
        notes: "",
        create_default_tasks: true,
      });
    }
  }, [employee, startOpen]);

  const query = useQuery({
    queryKey: ["employee-offboarding", employee.id],
    queryFn: () => offboardingApi.employee(employee.id),
    enabled: Boolean(employee.id),
  });
  const active = query.data?.data?.active_case;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["employee-offboarding", employee.id] }),
      queryClient.invalidateQueries({ queryKey: ["offboarding-cases"] }),
    ]);
  };
  const startMutation = useMutation({
    mutationFn: (payload: StartOffboardingPayload) => offboardingApi.start(employee.id, payload),
    onSuccess: async () => { setStartOpen(false); await refresh(); },
  });
  const taskMutation = useMutation({
    mutationFn: () => {
      if (!active || !action) throw new Error("Task is required.");
      return action.type === "complete"
        ? offboardingApi.completeTask(employee.id, active.case.id, action.task.id, { reason: reason || undefined })
        : offboardingApi.waiveTask(employee.id, active.case.id, action.task.id, { reason });
    },
    onSuccess: async () => { setAction(null); setReason(""); await refresh(); },
  });
  const settlementMutation = useMutation({
    mutationFn: () => active ? offboardingApi.prepareSettlement(employee.id, active.case.id, "Preparing final settlement draft") : Promise.reject(new Error("Offboarding case is required.")),
    onSuccess: refresh,
  });
  const readyMutation = useMutation({
    mutationFn: () => active ? offboardingApi.markReady(employee.id, active.case.id, "Checklist cleared for final settlement") : Promise.reject(new Error("Offboarding case is required.")),
    onSuccess: refresh,
  });

  const error = query.error ?? startMutation.error ?? taskMutation.error ?? settlementMutation.error ?? readyMutation.error;

  return (
    <div className="space-y-4">
        {error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Offboarding action could not be completed.")} /> : null}
      {active ? (
        <div className="rounded-lg border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h4 className="font-semibold">{label(active.case.offboarding_type)} offboarding</h4>
              <p className="text-sm text-muted-foreground">
                Status: {label(active.case.status)} · Exit date: {displayDate(active.case.effective_exit_date)} · {taskProgress(active)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Reason: {active.case.reason}</p>
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <LoadingButton loading={settlementMutation.isPending} variant="outline" onClick={() => settlementMutation.mutate()}>
                  <FileCheck2 className="h-4 w-4" />Prepare settlement
                </LoadingButton>
                <LoadingButton loading={readyMutation.isPending} variant="outline" onClick={() => readyMutation.mutate()}>
                  <CheckCircle2 className="h-4 w-4" />Mark ready
                </LoadingButton>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <InlineAlert title="No active offboarding case.">
          {canManage ? "Start offboarding to generate clearance tasks and prepare final settlement inputs." : "Offboarding information will appear here when HR starts a case."}
        </InlineAlert>
      )}

      {canManage && !active ? (
        <Button onClick={() => setStartOpen(true)}><Play className="h-4 w-4" />Start offboarding</Button>
      ) : null}

      {active ? (
        <>
          <DataTable<OffboardingTask>
            rows={active.tasks}
            loading={query.isLoading}
            getRowId={(row) => row.id}
            emptyTitle="No checklist tasks"
            compact
            columns={[
              { key: "title", header: "Task", cell: (row) => <div><p className="font-medium">{row.title}</p><p className="text-xs text-muted-foreground">{row.description ?? label(row.source_type)}</p></div> },
              { key: "required", header: "Required", cell: (row) => row.required ? "Required" : "Optional" },
              { key: "status", header: "Status", cell: (row) => label(row.status) },
              { key: "due_date", header: "Due date", cell: (row) => displayDate(row.due_date) },
              { key: "completed_by_name", header: "Completed by", cell: (row) => row.completed_by_name ?? "Not cleared" },
            ]}
            rowActions={canManage ? (row) => row.status === "pending" || row.status === "blocked" ? (
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setAction({ type: "complete", task: row })}>Complete</Button>
                <Button size="sm" variant="ghost" onClick={() => setAction({ type: "waive", task: row })}>Waive</Button>
              </div>
            ) : null : undefined}
          />
          <SettlementPreview detail={active} />
        </>
      ) : null}

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start offboarding</DialogTitle>
            <DialogDescription>Create a structured clearance checklist. This does not delete the employee or finalize payroll.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Offboarding type</Label>
              <Select value={startForm.offboarding_type} onValueChange={(value) => setStartForm((current) => ({ ...current, offboarding_type: value as OffboardingType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["resignation", "termination", "retirement", "contract_end", "other"].map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <AppDatePicker label="Effective exit date" value={startForm.effective_exit_date} onChange={(value) => setStartForm((current) => ({ ...current, effective_exit_date: value ?? "" }))} />
            <div className="grid gap-2">
              <Label>Reason</Label>
              <Textarea value={startForm.reason} onChange={(event) => setStartForm((current) => ({ ...current, reason: event.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={startForm.notes ?? ""} onChange={(event) => setStartForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={startForm.create_default_tasks} onCheckedChange={(checked) => setStartForm((current) => ({ ...current, create_default_tasks: Boolean(checked) }))} />
              Generate default checklist from assets, uniforms, user access, leave, advances, and loans
            </label>
            {startMutation.error ? <FormError message={friendlyHrmError(startMutation.error, "Offboarding could not be started.")} /> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
            <LoadingButton loading={startMutation.isPending} onClick={() => startMutation.mutate(startForm)}>Start offboarding</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(action)} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.type === "waive" ? "Waive offboarding task" : "Complete offboarding task"}</DialogTitle>
            <DialogDescription>
              {action?.task.task_type === "revoke_user_access" ? "Completing this task disables linked user access and revokes active sessions, unless it would disable the last Super Admin." : action?.task.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="grid gap-2 text-sm">
              {action?.type === "waive" ? "Waiver reason" : "Notes / reason"}
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </Label>
            {action?.type === "waive" && reason.trim().length < 3 ? <FormError message="A reason is required to waive a task." /> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <LoadingButton
              loading={taskMutation.isPending}
              onClick={() => {
                if (action?.type === "waive" && reason.trim().length < 3) return;
                taskMutation.mutate();
              }}
            >
              {action?.type === "waive" ? <RotateCcw className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
              {action?.type === "waive" ? "Waive task" : "Complete task"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
