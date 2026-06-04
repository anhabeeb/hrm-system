import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormError } from "@/components/feedback/FormError";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";

import { profileApi } from "./profile.api";
import { kycUpdateSchema } from "./profile.schema";

type KycValues = z.infer<typeof kycUpdateSchema>;

const defaults: KycValues = {
  full_name: "",
  phone: "",
  new_email: "",
  confirm_new_email: "",
  address: "",
  emergency_contact: "",
  document_note: "",
  reason: "",
};

const resolveRequestType = (values: KycValues) => {
  if (values.new_email?.trim()) return "email_update";
  if (values.full_name?.trim()) return "name_update";
  if (values.phone?.trim()) return "phone_update";
  if (values.address?.trim()) return "address_update";
  if (values.emergency_contact?.trim()) return "emergency_contact_update";
  return "document_update";
};

export const KycUpdateForm = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const form = useForm<KycValues>({ resolver: zodResolver(kycUpdateSchema), defaultValues: defaults });

  const onSubmit = async (values: KycValues) => {
    setSuccess(false);
    setError(null);
    try {
      const nextEmail = values.new_email?.trim().toLowerCase();
      if (nextEmail && nextEmail === user?.email?.trim().toLowerCase()) {
        setError({ message: "The new email must be different from your current email." });
        return;
      }
      const requestType = resolveRequestType(values);
      await profileApi.createKycRequest({
        request_type: requestType,
        requested_value_json: {
          email: requestType === "email_update" ? nextEmail : undefined,
          full_name: values.full_name || undefined,
          phone: values.phone || undefined,
          address: values.address || undefined,
          emergency_contact: values.emergency_contact || undefined,
          document_note: values.document_note || undefined,
        },
        reason: values.reason,
      });
      form.reset(defaults);
      setSuccess(true);
      await queryClient.invalidateQueries({ queryKey: ["kyc-requests"] });
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: "Profile update request could not be submitted." });
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        {success ? <InlineAlert title="Profile update request submitted successfully." variant="success" /> : null}
        <FormError message={error?.message} requestId={error?.requestId} />
        <InlineAlert title="Official fields are read-only" variant="info">
          Profile changes are reviewed through KYC/update requests. Role, permission, outlet, salary, payroll, and attendance changes cannot be requested here.
        </InlineAlert>
        <div className="rounded-lg border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">Email Update</h3>
          <p className="mt-1 text-sm text-muted-foreground">Request a reviewed change to your login email.</p>
          <InlineAlert title="Login email change" variant="warning">
            If approved, this will change the user's login email.
          </InlineAlert>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="space-y-1 text-sm">
              <span className="font-medium">Current email</span>
              <Input value={user?.email ?? "Not available"} readOnly aria-readonly />
            </div>
            <FormField control={form.control} name="new_email" render={({ field }) => (
              <FormItem>
                <FormLabel>New email</FormLabel>
                <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirm_new_email" render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new email</FormLabel>
                <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField control={form.control} name="full_name" render={({ field }) => (
            <FormItem>
              <FormLabel>Requested full name</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem>
              <FormLabel>Phone number</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="address" render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="emergency_contact" render={({ field }) => (
            <FormItem>
              <FormLabel>Emergency contact</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="document_note" render={({ field }) => (
          <FormItem>
            <FormLabel>Document update note</FormLabel>
            <FormControl><Textarea {...field} /></FormControl>
            <FormDescription>Document upload for profile updates will be added in a future screen.</FormDescription>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="reason" render={({ field }) => (
          <FormItem>
            <FormLabel>Reason</FormLabel>
            <FormControl><Textarea {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <LoadingButton type="submit" loading={form.formState.isSubmitting} loadingText="Submitting...">Submit request</LoadingButton>
      </form>
    </Form>
  );
};
