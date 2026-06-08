import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { LookupCombobox } from "@/components/selectors/LookupCombobox";
import { lookupApi } from "@/components/selectors/lookup-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TableColumn } from "@/types/common";
import type { LeaveAccrualPayload, LeaveAccrualRow } from "./leave.types";

const today = new Date().toISOString().slice(0, 10);

const columns: TableColumn<LeaveAccrualRow>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => `${row.employee_code ?? ""} ${row.employee_name ?? row.employee_id}`.trim() },
  { key: "leave_type_name", header: "Leave Type", cell: (row) => row.leave_type_name ?? row.leave_type_id },
  { key: "period_key", header: "Period" },
  { key: "current_balance", header: "Current" },
  { key: "accrual_amount", header: "Accrual" },
  { key: "resulting_balance", header: "Result" },
  { key: "skipped_reason", header: "Status", cell: (row) => row.skipped ? row.skipped_reason ?? "Skipped" : "Ready" },
];

export const LeaveAccrualPanel = ({
  rows,
  loading,
  applying,
  error,
  success,
  canApply,
  onPreview,
  onApply,
}: {
  rows: LeaveAccrualRow[];
  loading?: boolean;
  applying?: boolean;
  error?: string | null;
  success?: string | null;
  canApply: boolean;
  onPreview: (payload: LeaveAccrualPayload) => void;
  onApply: (payload: LeaveAccrualPayload) => void;
}) => {
  const [payload, setPayload] = useState<LeaveAccrualPayload>({ as_of_date: today });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const readyRows = rows.filter((row) => !row.skipped && row.accrual_amount > 0);

  return (
    <div className="space-y-4">
      {error ? <InlineAlert title={error} variant="error" /> : null}
      {success ? <InlineAlert title={success} variant="success" /> : null}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>As-of date</Label>
            <Input type="date" value={payload.as_of_date} onChange={(event) => setPayload((current) => ({ ...current, as_of_date: event.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Employee</Label>
            <LookupCombobox value={payload.employee_id} onChange={(employee_id) => setPayload((current) => ({ ...current, employee_id }))} queryKey={["lookups", "employees"]} queryFn={lookupApi.employees} placeholder="All employees" />
          </div>
          <div className="space-y-1">
            <Label>Outlet</Label>
            <LookupCombobox value={payload.outlet_id} onChange={(outlet_id) => setPayload((current) => ({ ...current, outlet_id }))} queryKey={["lookups", "outlets"]} queryFn={lookupApi.outlets} placeholder="All outlets" />
          </div>
          <div className="space-y-1">
            <Label>Leave type</Label>
            <LookupCombobox value={payload.leave_type_id} onChange={(leave_type_id) => setPayload((current) => ({ ...current, leave_type_id }))} queryKey={["lookups", "leave-types"]} queryFn={lookupApi.leaveTypes} placeholder="All leave types" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onPreview(payload)} disabled={loading}>Preview accrual</Button>
          {canApply ? <Button onClick={() => setConfirmOpen(true)} disabled={readyRows.length === 0 || applying}><Check className="h-4 w-4" />Apply previewed accrual</Button> : null}
        </div>
        {readyRows.length > 0 ? (
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            Applying is idempotent. Employees already credited for the same period will be skipped.
          </p>
        ) : null}
      </div>
      <DataTable rows={rows} columns={columns} getRowId={(row) => `${row.employee_id}-${row.leave_type_id}-${row.period_key}`} loading={loading || applying} compact emptyTitle="Preview accrual to see affected employees" />
      <ReasonDialog
        open={confirmOpen}
        title="Apply leave accrual"
        description={`This will apply accrual for ${readyRows.length} row(s). A reason is required.`}
        confirmLabel="Apply accrual"
        loading={applying}
        onOpenChange={setConfirmOpen}
        onSubmit={(reason) => { setConfirmOpen(false); onApply({ ...payload, reason }); }}
      />
    </div>
  );
};
