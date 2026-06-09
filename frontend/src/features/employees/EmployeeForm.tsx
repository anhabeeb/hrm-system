import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { RequiredLabel } from "@/components/forms/RequiredLabel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DepartmentCombobox, OutletCombobox, PositionCombobox } from "@/components/selectors";
import type { Department } from "@/features/departments/departments.types";
import type { Outlet } from "@/features/outlets/outlets.types";
import type { Position } from "@/features/positions/positions.types";
import type { ApiError } from "@/lib/api-errors";
import { employeeCreateSchema, employeeUpdateSchema, type EmployeeFormValues } from "./employees.schema";
import type { Employee } from "./employees.types";

const emergencyContactRelations = ["Parent", "Spouse", "Sibling", "Child", "Relative", "Friend", "Guardian", "Other"];

const defaults: EmployeeFormValues = {
  employee_code: null,
  full_name: "",
  employee_type: "local",
  primary_outlet_id: "",
  department_id: null,
  position_id: null,
  employment_status: "active",
  joined_at: null,
  nationality: null,
  id_card_number: null,
  passport_number: null,
  passport_expiry_date: null,
  work_permit_number: null,
  work_permit_expiry_date: null,
  phone: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  emergency_contact_relation: null,
  contract_type: null,
  notes: null,
  starting_salary: {
    amount: 0,
    salary_type: "monthly",
    currency: "MVR",
    effective_from: new Date().toISOString().slice(0, 10),
    reason: "Starting salary",
  },
};

export const EmployeeForm = ({
  open,
  mode,
  employee,
  outlets,
  departments,
  positions,
  error,
  loading,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  employee?: Employee | null;
  outlets: Outlet[];
  departments: Department[];
  positions: Position[];
  error?: ApiError | null;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: EmployeeFormValues) => void;
}) => {
  const isEdit = mode === "edit";
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(isEdit ? employeeUpdateSchema : employeeCreateSchema),
    defaultValues: defaults,
  });
  const employeeType = form.watch("employee_type");
  const joinedAt = form.watch("joined_at");
  const departmentId = form.watch("department_id");
  const positionId = form.watch("position_id");
  const startingSalaryAmount = form.watch("starting_salary.amount");

  useEffect(() => {
    if (!open) return;
    form.reset(employee ? {
      employee_code: employee.employee_code,
      full_name: employee.full_name,
      employee_type: employee.employee_type,
      primary_outlet_id: employee.primary_outlet_id ?? "",
      department_id: employee.department_id ?? null,
      position_id: employee.position_id ?? null,
      employment_status: employee.employment_status,
      joined_at: employee.joined_at ?? null,
      nationality: employee.nationality ?? null,
      id_card_number: employee.id_card_number ?? null,
      passport_number: employee.passport_number ?? null,
      passport_expiry_date: employee.passport_expiry_date ?? null,
      work_permit_number: employee.work_permit_number ?? null,
      work_permit_expiry_date: employee.work_permit_expiry_date ?? null,
      phone: employee.phone ?? null,
      emergency_contact_name: employee.emergency_contact_name ?? null,
      emergency_contact_phone: employee.emergency_contact_phone ?? null,
      emergency_contact_relation: employee.emergency_contact_relation ?? null,
      contract_type: employee.contract_type ?? null,
      notes: null,
      starting_salary: defaults.starting_salary,
    } : defaults);
  }, [employee, form, open]);

  useEffect(() => {
    if (!open || isEdit || !joinedAt) return;
    const currentEffectiveFrom = form.getValues("starting_salary.effective_from");
    if (!currentEffectiveFrom || currentEffectiveFrom === defaults.starting_salary.effective_from) {
      form.setValue("starting_salary.effective_from", joinedAt);
    }
  }, [form, isEdit, joinedAt, open]);

  useEffect(() => {
    if (!open || isEdit || !positionId || startingSalaryAmount > 0) return;
    const selectedPosition = positions.find((position) => position.id === positionId);
    if (selectedPosition?.default_salary_amount) {
      form.setValue("starting_salary.amount", selectedPosition.default_salary_amount);
    }
  }, [form, isEdit, open, positionId, positions, startingSalaryAmount]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Employee" : "Add Employee"}</DialogTitle>
          <DialogDescription>Official employee records are managed here by authorized HR/Admin users.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormError message={error?.message} requestId={error?.requestId} />
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="employee_code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee ID</FormLabel>
                  <FormControl>
                    <Input
                      value={isEdit ? field.value ?? "" : "System generated after save"}
                      disabled
                      readOnly
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem><FormLabel><RequiredLabel>Full name</RequiredLabel></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="employee_type" render={({ field }) => (
                <FormItem><FormLabel><RequiredLabel>Employee type</RequiredLabel></FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="local">Local</SelectItem><SelectItem value="foreign">Foreign</SelectItem></SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="employment_status" render={({ field }) => (
                <FormItem><FormLabel><RequiredLabel>Status</RequiredLabel></FormLabel><Select value={field.value} onValueChange={field.onChange} disabled={isEdit}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{["active", "probation", "confirmed", "on_leave", "long_leave", "suspended", "resigned", "terminated", "retired", "inactive", "rehired", "archived"].map((status) => <SelectItem key={status} value={status}>{status.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="primary_outlet_id" render={({ field }) => (
                <FormItem>
                  <FormLabel><RequiredLabel>Primary outlet</RequiredLabel></FormLabel>
                  <OutletCombobox value={field.value} onChange={(value) => field.onChange(value ?? "")} disabled={isEdit} />
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="department_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <DepartmentCombobox value={field.value} onChange={(value) => field.onChange(value ?? null)} placeholder="No department" />
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="position_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Position</FormLabel>
                  <PositionCombobox value={field.value} onChange={(value) => field.onChange(value ?? null)} departmentId={departmentId} placeholder="No position" />
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="joined_at" render={({ field }) => (
                <FormItem><FormLabel>Joined date</FormLabel><FormControl><Input type="date" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
              )} />
              {employeeType === "local" ? (
                <FormField control={form.control} name="id_card_number" render={({ field }) => (
                  <FormItem><FormLabel><RequiredLabel>National ID number</RequiredLabel></FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
                )} />
              ) : (
                <>
                  <FormField control={form.control} name="nationality" render={({ field }) => (
                    <FormItem><FormLabel><RequiredLabel>Nationality</RequiredLabel></FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="passport_number" render={({ field }) => (
                    <FormItem><FormLabel><RequiredLabel>Passport number</RequiredLabel></FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="passport_expiry_date" render={({ field }) => (
                    <FormItem><FormLabel><RequiredLabel>Passport expiry date</RequiredLabel></FormLabel><FormControl><Input type="date" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="work_permit_number" render={({ field }) => (
                    <FormItem><FormLabel><RequiredLabel>Work permit number</RequiredLabel></FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="work_permit_expiry_date" render={({ field }) => (
                    <FormItem><FormLabel><RequiredLabel>Work permit expiry date</RequiredLabel></FormLabel><FormControl><Input type="date" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
                  )} />
                </>
              )}
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contract_type" render={({ field }) => (
                <FormItem><FormLabel>Contract type</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <h3 className="text-sm font-semibold">Emergency Contact</h3>
                <p className="text-xs text-muted-foreground">Optional contact information for urgent employee support.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <FormField control={form.control} name="emergency_contact_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emergency Contact Name</FormLabel>
                    <FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="emergency_contact_phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emergency Contact Phone</FormLabel>
                    <FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="emergency_contact_relation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relationship</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={(value) => field.onChange(value || null)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {emergencyContactRelations.map((relation) => <SelectItem key={relation} value={relation}>{relation}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </section>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
            )} />
            {!isEdit ? (
              <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Salary Details</h3>
                  <p className="text-xs text-muted-foreground">Starting salary is saved to employee salary history for payroll. Position salary is only used as a suggestion.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField control={form.control} name="starting_salary.amount" render={({ field }) => (
                    <FormItem>
                      <FormLabel><RequiredLabel>Basic salary amount</RequiredLabel></FormLabel>
                      <FormControl><Input type="number" min="1" step="1" value={field.value || ""} onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value))} /></FormControl>
                      <p className="text-xs text-muted-foreground">Enter integer minor units, for example 750000 for MVR 7,500.00.</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="starting_salary.salary_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel><RequiredLabel>Salary type</RequiredLabel></FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent><SelectItem value="monthly">Monthly</SelectItem></SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="starting_salary.currency" render={({ field }) => (
                    <FormItem><FormLabel><RequiredLabel>Currency</RequiredLabel></FormLabel><FormControl><Input value={field.value ?? "MVR"} onChange={(event) => field.onChange(event.target.value || "MVR")} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="starting_salary.effective_from" render={({ field }) => (
                    <FormItem><FormLabel><RequiredLabel>Effective from</RequiredLabel></FormLabel><FormControl><Input type="date" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value)} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="starting_salary.reason" render={({ field }) => (
                  <FormItem><FormLabel>Reason / notes</FormLabel><FormControl><Textarea value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
                )} />
              </section>
            ) : null}
            {isEdit ? <p className="text-xs text-muted-foreground">Status and outlet changes use dedicated reason-required actions and are not changed through this edit form.</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <LoadingButton loading={loading} loadingText={isEdit ? "Saving..." : "Creating..."}>{isEdit ? "Save changes" : "Create employee"}</LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
