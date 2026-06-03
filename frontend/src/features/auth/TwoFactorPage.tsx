import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/feedback/FormError";
import { ApiError } from "@/lib/api-errors";

import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./auth.store";
import { twoFactorLoginSchema } from "./login.schema";
import type { z } from "zod";

export const TwoFactorPage = () => {
  const navigate = useNavigate();
  const { verifyLoginTwoFactor, hasPendingTwoFactorLogin, clearPendingTwoFactorLogin } = useAuth();
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const form = useForm<z.infer<typeof twoFactorLoginSchema>>({ resolver: zodResolver(twoFactorLoginSchema), defaultValues: { code: "" } });

  if (!hasPendingTwoFactorLogin) {
    return <Navigate to="/login" replace state={{ message: "Please log in again to continue." }} />;
  }

  const onSubmit = async (values: z.infer<typeof twoFactorLoginSchema>) => {
    setError(null);
    try {
      await verifyLoginTwoFactor(values.code);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError({ message: "The verification code is invalid or has expired.", requestId: err.requestId });
      else setError({ message: "The verification code is invalid or has expired." });
    }
  };

  return (
    <AuthLayout title="Two-factor verification" description="Enter the code from Google Authenticator.">
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <FormError message={error?.message} requestId={error?.requestId} />
          <FormField control={form.control} name="code" render={({ field }) => (
            <FormItem>
              <FormLabel>Authenticator code</FormLabel>
              <FormControl><Input inputMode="numeric" autoComplete="one-time-code" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>Verify and continue</Button>
          <Button
            className="w-full"
            type="button"
            variant="outline"
            onClick={() => {
              clearPendingTwoFactorLogin();
              navigate("/login", { replace: true });
            }}
          >
            Back to sign in
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
};
