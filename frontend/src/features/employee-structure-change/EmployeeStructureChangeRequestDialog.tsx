import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { departmentsApi } from "@/features/departments/departments.api";
import { employeesApi } from "@/features/employees/employees.api";
import { outletsApi } from "@/features/outlets/outlets.api";
import { positionsApi } from "@/features/positions/positions.api";
import type { EmployeeStructureChangePayload } from "./employeeStructureChange.types";

const requestTypes = [
  "DEPARTMENT_TRANSFER",
  "OUTLET_TRANSFER",
  "STORE_TRANSFER",
  "DEPARTMENT_AND_OUTLET_TRANSFER",
  "POSITION_TRANSFER",
  "INTER_DEPARTMENT_POSITION_CHANGE",
  "TEMPORARY_TRANSFER",
  "PERMANENT_TRANSFER",
  "POSITION_TITLE_CHANGE",
  "LEVEL_CHANGE",
  "DEPARTMENT_ASSIGNMENT_CHANGE",
  "OUTLET_ASSIGNMENT_CHANGE",
  "STORE_ASSIGNMENT_CHANGE",
  "ROLE_TEMPLATE_REAPPLY",
  "DEPARTMENT_HEAD_CHANGE",
  "REPORTING_MANAGER_CHANGE",
  "EMPLOYEE_STRUCTURE_CORRECTION",
  "GENERAL_STRUCTURE_CHANGE",
];

export const EmployeeStructureChangeRequestDialog = ({
  open,
  loading,
  error,
  currentEmployeeId,
  canSelectEmployee,
  canApplyRoleTemplate,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  currentEmployeeId?: string | null;
  canSelectEmployee?: boolean;
  canApplyRoleTemplate?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EmployeeStructureChangePayload) => void;
}) => {
  const employeesQuery = useQuery({
    queryKey: ["employee-structure-change", "employees", canSelectEmployee],
    queryFn: () => employeesApi.list({ page: 1, page_size: 100, employment_status: "active" }),
    enabled: Boolean(open && canSelectEmployee),
  });
  const departmentsQuery = useQuery({
    queryKey: ["employee-structure-change", "departments"],
    queryFn: () => departmentsApi.list({ page: 1, page_size: 100, status: "active" }),
    enabled: open,
  });
  const positionsQuery = useQuery({
    queryKey: ["employee-structure-change", "positions", open],
    queryFn: () => positionsApi.list({ page: 1, page_size: 100, status: "active" }),
    enabled: open,
  });
  const outletsQuery = useQuery({
    queryKey: ["employee-structure-change", "outlets"],
    queryFn: () => outletsApi.list({ page: 1, page_size: 100, status: "active" }),
    enabled: open,
  });
  const [form, setForm] = useState<EmployeeStructureChangePayload>({
    employee_id: currentEmployeeId ?? "",
    request_type: "DEPARTMENT_TRANSFER",
    requested_department_id: "",
    requested_position_id: "",
    requested_outlet_id: "",
    apply_role_template: false,
    reason: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        employee_id: currentEmployeeId ?? "",
        request_type: "DEPARTMENT_TRANSFER",
        requested_department_id: "",
        requested_position_id: "",
        requested_outlet_id: "",
        apply_role_template: false,
        reason: "",
      });
    }
  }, [currentEmployeeId, open]);

  const update = (key: keyof EmployeeStructureChangePayload, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const departmentPositions = (positionsQuery.data?.data ?? []).filter((position) =>
    !form.requested_department_id || position.department_id === form.requested_department_id,
  );
  const selectedPosition = departmentPositions.find((position) => position.id === form.requested_position_id);
  const hasChange = Boolean(form.requested_department_id || form.requested_position_id || form.requested_outlet_id || (canApplyRoleTemplate && form.apply_role_template));
  const canSubmit = Boolean(form.request_type && form.reason.trim() && hasChange && (canSelectEmployee || currentEmployeeId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request employee transfer / structure change</DialogTitle>
          <DialogDescription>
            Level is derived by the backend from the selected position/title. Department, position, and outlet changes are applied only after approval and execution.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {error ? <div className="md:col-span-2"><InlineAlert variant="error" title={error} /></div> : null}
          {canSelectEmployee ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Employee selector</span>
              <Select value={form.employee_id || "__none"} onValueChange={(value) => update("employee_id", value === "__none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Search/select employee..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select employee</SelectItem>
                  {(employeesQuery.data?.data ?? []).map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>{employee.full_name} ({employee.employee_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Employee</span>
              <Input value={currentEmployeeId ?? "Your linked employee profile"} disabled />
            </label>
          )}
          <label className="space-y-1 text-sm">
            <span className="font-medium">Request type</span>
            <Select value={form.request_type} onValueChange={(value) => update("request_type", value)}>
              <SelectTrigger><SelectValue placeholder="Select request type" /></SelectTrigger>
              <SelectContent>{requestTypes.map((type) => <SelectItem key={type} value={type}>{type.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Department selector</span>
            <Select
              value={form.requested_department_id || "__none"}
              onValueChange={(value) => setForm((current) => ({ ...current, requested_department_id: value === "__none" ? "" : value, requested_position_id: "" }))}
            >
              <SelectTrigger><SelectValue placeholder="Search/select target department..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No department change</SelectItem>
                {(departmentsQuery.data?.data ?? []).map((department) => (
                  <SelectItem key={department.id} value={department.id}>{department.name} {department.code ? `(${department.code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Position / title selector</span>
            <Select value={form.requested_position_id || "__none"} onValueChange={(value) => update("requested_position_id", value === "__none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Select a department first, then position/title..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No position/title change</SelectItem>
                {departmentPositions.map((position) => (
                  <SelectItem key={position.id} value={position.id}>{position.title} / Level {position.level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="block text-xs text-muted-foreground">Requested level: {selectedPosition ? `Level ${selectedPosition.level}` : "Level is assigned by the selected position/title."}</span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Outlet/store selector</span>
            <Select value={form.requested_outlet_id || "__none"} onValueChange={(value) => update("requested_outlet_id", value === "__none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Search/select target outlet or store..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No outlet/store change</SelectItem>
                {(outletsQuery.data?.data ?? []).map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>{outlet.name} {outlet.code ? `(${outlet.code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Effective date</span>
            <Input type="date" value={form.effective_date ?? ""} onChange={(event) => update("effective_date", event.target.value)} />
          </label>
          {canApplyRoleTemplate ? (
            <label className="flex items-center gap-2 pt-7 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={Boolean(form.apply_role_template)}
                onChange={(event) => update("apply_role_template", event.target.checked)}
              />
              Apply level role template after approval
            </label>
          ) : (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Role template application is available only to authorized HR/access administrators.
            </p>
          )}
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Reason</span>
            <Input value={form.reason} onChange={(event) => update("reason", event.target.value)} placeholder="Explain why this transfer or structure change is needed" />
          </label>
          {!hasChange ? <p className="text-xs text-muted-foreground md:col-span-2">Add a department, position/title, outlet/store change, or role-template reapply before submitting.</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={loading || !canSubmit} onClick={() => onSubmit({ ...form, employee_id: canSelectEmployee ? form.employee_id : currentEmployeeId })}>
            Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
