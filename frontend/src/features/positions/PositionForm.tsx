import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { RequiredLabel } from "@/components/forms/RequiredLabel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Department } from "@/features/departments/departments.types";
import type { Role } from "@/features/roles/roles.types";
import type { ApiError } from "@/lib/api-errors";
import { positionSchema, type PositionFormValues } from "./positions.schema";
import type { Position } from "./positions.types";

const defaults: PositionFormValues = {
  title: "",
  code: null,
  department_id: "",
  description: null,
  level: 1,
  default_role_id: null,
  can_manage_lower_levels: false,
  can_act_as_department_approver: false,
  default_salary_amount: null,
  status: "active",
};

export const PositionForm = ({ open, position, departments, roles, error, loading, onOpenChange, onSubmit }: {
  open: boolean;
  position?: Position | null;
  departments: Department[];
  roles?: Role[];
  error?: ApiError | null;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PositionFormValues) => void;
}) => {
  const form = useForm<PositionFormValues>({ resolver: zodResolver(positionSchema), defaultValues: defaults });
  useEffect(() => {
    if (open) form.reset(position ? {
      title: position.title,
      code: position.code ?? null,
      department_id: position.department_id ?? "",
      description: position.description ?? null,
      level: position.level ?? 1,
      default_role_id: position.default_role_id ?? null,
      can_manage_lower_levels: Boolean(position.can_manage_lower_levels),
      can_act_as_department_approver: Boolean(position.can_act_as_department_approver),
      default_salary_amount: position.default_salary_amount ?? null,
      status: position.status,
    } : defaults);
  }, [form, open, position]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{position ? "Edit Position" : "Create Position"}</DialogTitle><DialogDescription>Positions belong to a department and define the employee access level foundation.</DialogDescription></DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormError message={error?.message} requestId={error?.requestId} />
            <FormField control={form.control} name="title" render={({ field }) => <FormItem><FormLabel><RequiredLabel>Position name</RequiredLabel></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="code" render={({ field }) => <FormItem><FormLabel>Position code</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="department_id" render={({ field }) => <FormItem><FormLabel><RequiredLabel>Department</RequiredLabel></FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl><SelectContent>{departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
              <FormField control={form.control} name="level" render={({ field }) => <FormItem><FormLabel><RequiredLabel>Level</RequiredLabel></FormLabel><Select value={String(field.value ?? 1)} onValueChange={(value) => field.onChange(Number(value))}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="1">Level 1 - Employee Self-Service</SelectItem><SelectItem value="2">Level 2 - Senior Employee</SelectItem><SelectItem value="3">Level 3 - Supervisor</SelectItem><SelectItem value="4">Level 4 - Department Manager</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
              <FormField control={form.control} name="default_role_id" render={({ field }) => <FormItem><FormLabel>Default role</FormLabel><Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}><FormControl><SelectTrigger><SelectValue placeholder="No default role" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">No default role</SelectItem>{(roles ?? []).map((role) => <SelectItem key={role.id} value={role.id}>{role.role_name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
              <FormField control={form.control} name="default_salary_amount" render={({ field }) => <FormItem><FormLabel>Default salary (minor units)</FormLabel><FormControl><Input type="number" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="status" render={({ field }) => <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
            </div>
            <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
              <FormField control={form.control} name="can_manage_lower_levels" render={({ field }) => <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} /></FormControl><FormLabel className="text-sm font-normal">Can manage lower levels</FormLabel><FormMessage /></FormItem>} />
              <FormField control={form.control} name="can_act_as_department_approver" render={({ field }) => <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} /></FormControl><FormLabel className="text-sm font-normal">Department approver candidate</FormLabel><FormMessage /></FormItem>} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} rows={3} /></FormControl><FormMessage /></FormItem>} />
            <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading}>{position ? "Save changes" : "Create position"}</LoadingButton></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
