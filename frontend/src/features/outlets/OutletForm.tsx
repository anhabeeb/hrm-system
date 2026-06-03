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
import { outletSchema, type OutletFormValues } from "./outlets.schema";
import type { Outlet } from "./outlets.types";

const defaults: OutletFormValues = { name: "", code: null, address: null, phone: null, status: "active" };

export const OutletForm = ({ open, outlet, error, loading, onOpenChange, onSubmit }: {
  open: boolean;
  outlet?: Outlet | null;
  error?: ApiError | null;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: OutletFormValues) => void;
}) => {
  const form = useForm<OutletFormValues>({ resolver: zodResolver(outletSchema), defaultValues: defaults });
  useEffect(() => {
    if (open) form.reset(outlet ? { name: outlet.name, code: outlet.code ?? null, address: outlet.address ?? null, phone: outlet.phone ?? null, status: outlet.status } : defaults);
  }, [form, open, outlet]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{outlet ? "Edit Outlet" : "Create Outlet"}</DialogTitle>
          <DialogDescription>Manage operational outlet details used across HR modules.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormError message={error?.message} requestId={error?.requestId} />
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel><RequiredLabel>Outlet name</RequiredLabel></FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem><FormLabel>Outlet code</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem><FormLabel>Location / address</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem><FormLabel>Phone</FormLabel><FormControl><Input value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value || null)} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading}>{outlet ? "Save changes" : "Create outlet"}</LoadingButton></DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
