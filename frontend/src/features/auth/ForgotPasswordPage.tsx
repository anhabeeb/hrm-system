import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import type { z } from "zod";

import { FormError } from "@/components/feedback/FormError";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-errors";

import { authApi } from "./api";
import { AuthLayout } from "./AuthLayout";
import { forgotPasswordSchema } from "./reset-password.schema";

export const ForgotPasswordPage = () => {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  return (
    <AuthLayout title="Reset password" description="Request a password reset link for your account.">
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            setError(null);
            try {
              await authApi.requestPasswordReset(values.email);
              setSent(true);
            } catch (err) {
              if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
              else setError({ message: "Password reset could not be requested." });
            }
          })}
        >
          <FormError message={error?.message} requestId={error?.requestId} />
          {sent ? <InlineAlert title="Password reset requested" variant="success">If an account exists for this email, password reset instructions will be sent.</InlineAlert> : null}
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl><Input autoComplete="email" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <LoadingButton className="w-full" type="submit" loading={form.formState.isSubmitting} loadingText="Requesting reset...">Request reset</LoadingButton>
          <Link className="block text-center text-sm font-medium text-primary hover:underline" to="/login">Back to sign in</Link>
        </form>
      </Form>
    </AuthLayout>
  );
};
