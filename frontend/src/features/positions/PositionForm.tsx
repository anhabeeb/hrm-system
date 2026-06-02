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
import type { Department } from "@/features/departments/departments.types";
import type { ApiError } from "@/lib/api-errors";
import { positionSchema, type PositionFormValues } from "./positions.schema";
import type { Position } from "./positions.types";

const defaults: PositionFormValues = { title: "", code: null, department_id: null, default_salary_amount: null, status: "active" };

export const PositionForm = ({ open, position, departments, error, loading, onOpenChange, onSubmit }: {
  open: boolean;
  position?: Position | null;
  departments: Department[];
  error?: ApiError | null;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PositionFormValues) => void;
}) => {
  const form = useForm<PositionFormValues>({ resolver: zodResolver(positionSchema), defaultValues: defaults });
  useEffect(() => {
    if (open) form.reset(position ? { title: position.title, code: position.code ?? null, department_id: position.department_id ?? null, default_salary_amount: position.default_salary_amount ?? null, status: position.status } : defaults);
  }, [form, open, position]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{position ? "Edit Position" : "Create Position"}</DialogTitle><DialogDescription>Positions may optionally belong to a department.</DialogDescription></DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormError message={error?.message} requestId={error?.requestId} />
            <FormField control={form.control} name="title" render={({ field }) => <FormItem><FormLabel><RequiredLabel>Position name</RequiredLabel></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="code" render={({ field }) => <FormItem><FormLabel>Position code</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="department_id" render={({ field }) => <FormItem><FormLabel>Department</FormLabel><Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">No department</SelectItem>{departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
              <FormField control={form.control} name="default_salary_amount" render={({ field }) => <FormItem><FormLabel>Default salary (minor units)</FormLabel><FormControl><Input type="number" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="status" render={({ field }) => <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading}>{position ? "Save changes" : "Create position"}</LoadingButton></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
