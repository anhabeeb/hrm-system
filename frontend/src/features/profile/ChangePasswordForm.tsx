import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormError } from "@/components/feedback/FormError";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { PasswordStrengthHint } from "@/components/forms/PasswordStrengthHint";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ApiError } from "@/lib/api-errors";

import { profileApi } from "./profile.api";
import { changePasswordSchema } from "./profile.schema";

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

const defaults: ChangePasswordValues = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

export const ChangePasswordForm = () => {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const form = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordSchema), defaultValues: defaults });
  const newPassword = form.watch("new_password");

  const onSubmit = async (values: ChangePasswordValues) => {
    setError(null);
    setSuccess(false);
    try {
      await profileApi.changePassword(values);
      form.reset(defaults);
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message || "Password could not be changed.", requestId: err.requestId });
      else setError({ message: "Password could not be changed." });
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        {success ? <InlineAlert title="Password changed successfully." variant="success" /> : null}
        <FormError message={error?.message} requestId={error?.requestId} />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField control={form.control} name="current_password" render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl><PasswordInput autoComplete="current-password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div />
          <FormField control={form.control} name="new_password" render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="confirm_password" render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <PasswordStrengthHint password={newPassword} />
        <LoadingButton type="submit" loading={form.formState.isSubmitting} loadingText="Changing password...">
          Change password
        </LoadingButton>
      </form>
    </Form>
  );
};
