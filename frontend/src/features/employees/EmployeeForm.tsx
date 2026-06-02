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
import type { Department } from "@/features/departments/departments.types";
import type { Outlet } from "@/features/outlets/outlets.types";
import type { Position } from "@/features/positions/positions.types";
import type { ApiError } from "@/lib/api-errors";
import { employeeSchema, type EmployeeFormValues } from "./employees.schema";
import type { Employee } from "./employees.types";

const defaults: EmployeeFormValues = {
  employee_code: "",
  full_name: "",
  employee_type: "local",
  primary_outlet_id: "",
  department_id: null,
  position_id: null,
  employment_status: "active",
  joined_at: null,
  nationality: null,
  phone: null,
  contract_type: null,
  notes: null,
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
  const form = useForm<EmployeeFormValues>({ resolver: zodResolver(employeeSchema), defaultValues: defaults });
  const isEdit = mode === "edit";

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
      phone: employee.phone ?? null,
      contract_type: employee.contract_type ?? null,
      notes: null,
    } : defaults);
  }, [employee, form, open]);

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
                <FormItem><FormLabel><RequiredLabel>Employee code</RequiredLabel></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem><FormLabel><RequiredLabel>Full name</RequiredLabel></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="employee_type" render={({ field }) => (
                <FormItem><FormLabel><RequiredLabel>Employee type</RequiredLabel></FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="local">Local</SelectItem><SelectItem value="foreign">Foreign</SelectItem></SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="employment_status" render={({ field }) => (
                <FormItem><FormLabel><RequiredLabel>Status</RequiredLabel></FormLabel><Select value={field.value} onValueChange={field.onChange} disabled={isEdit}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{["active", "on_leave", "long_leave", "suspended", "resigned", "terminated", "archived"].map((status) => <SelectItem key={status} value={status}>{status.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="primary_outlet_id" render={({ field }) => (
                <FormItem><FormLabel><RequiredLabel>Primary outlet</RequiredLabel></FormLabel><Select value={field.value} onValueChange={field.onChange} disabled={isEdit}><FormControl><SelectTrigger><SelectValue placeholder="Choose outlet" /></SelectTrigger></FormControl><SelectContent>{outlets.map((outlet) => <SelectItem key={outlet.id} value={outlet.id}>{outlet.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="department_id" render={({ field }) => (
                <FormItem><FormLabel>Department</FormLabel><Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}><FormControl><SelectTrigger><SelectValue placeholder="Choose department" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">No department</SelectItem>{departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="position_id" render={({ field }) => (
                <FormItem><FormLabel>Position</FormLabel><Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}><FormControl><SelectTrigger><SelectValue placeholder="Choose position" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">No position</SelectItem>{positions.map((position) => <SelectItem key={position.id} value={position.id}>{position.title}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="joined_at" render={({ field }) => (
                <FormItem><FormLabel>Joined date</FormLabel><FormControl><Input type="date" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="nationality" render={({ field }) => (
                <FormItem><FormLabel>Nationality</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contract_type" render={({ field }) => (
                <FormItem><FormLabel>Contract type</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
            )} />
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
