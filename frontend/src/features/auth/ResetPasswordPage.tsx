import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { z } from "zod";

import { FormError } from "@/components/feedback/FormError";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { PasswordStrengthHint } from "@/components/forms/PasswordStrengthHint";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-errors";

import { authApi } from "./api";
import { AuthLayout } from "./AuthLayout";
import { resetPasswordSchema } from "./reset-password.schema";

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: searchParams.get("token") ?? "", new_password: "", confirm_password: "" },
  });
  const password = form.watch("new_password");

  return (
    <AuthLayout title="Set a new password" description="Choose a strong password to regain access.">
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            setError(null);
            try {
              await authApi.confirmPasswordReset(values);
              setComplete(true);
              form.reset({ token: "", new_password: "", confirm_password: "" });
              window.setTimeout(() => navigate("/login", { replace: true, state: { message: "Password changed successfully. Please log in." } }), 900);
            } catch (err) {
              if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
              else setError({ message: "Password could not be reset." });
            }
          })}
        >
          <FormError message={error?.message} requestId={error?.requestId} />
          {complete ? <InlineAlert title="Password updated" variant="success">You can now sign in with your new password.</InlineAlert> : null}
          <FormField control={form.control} name="token" render={({ field }) => (
            <FormItem>
              <FormLabel>Reset token</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="new_password" render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="confirm_password" render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <PasswordStrengthHint password={password} />
          <LoadingButton className="w-full" type="submit" loading={form.formState.isSubmitting} loadingText="Updating password...">Update password</LoadingButton>
          <Link className="block text-center text-sm font-medium text-primary hover:underline" to="/login">Back to sign in</Link>
        </form>
      </Form>
    </AuthLayout>
  );
};
