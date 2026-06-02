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
import type { ApiError } from "@/lib/api-errors";
import { departmentSchema, type DepartmentFormValues } from "./departments.schema";
import type { Department } from "./departments.types";

const defaults: DepartmentFormValues = { name: "", code: null, status: "active" };

export const DepartmentForm = ({ open, department, error, loading, onOpenChange, onSubmit }: {
  open: boolean;
  department?: Department | null;
  error?: ApiError | null;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DepartmentFormValues) => void;
}) => {
  const form = useForm<DepartmentFormValues>({ resolver: zodResolver(departmentSchema), defaultValues: defaults });
  useEffect(() => {
    if (open) form.reset(department ? { name: department.name, code: department.code ?? null, status: department.status } : defaults);
  }, [department, form, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{department ? "Edit Department" : "Create Department"}</DialogTitle><DialogDescription>Departments are company-level in the current backend model.</DialogDescription></DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormError message={error?.message} requestId={error?.requestId} />
            <FormField control={form.control} name="name" render={({ field }) => <FormItem><FormLabel><RequiredLabel>Department name</RequiredLabel></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="code" render={({ field }) => <FormItem><FormLabel>Department code</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="status" render={({ field }) => <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
            <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading}>{department ? "Save changes" : "Create department"}</LoadingButton></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
