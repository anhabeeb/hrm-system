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
  const [error, setError] = useState<ApiError | Error | null>(null);
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
      if (err instanceof ApiError && (err.code === "INVALID_TWO_FACTOR_CODE" || err.code === "TWO_FACTOR_SETUP_EXPIRED")) {
        setError(new ApiError("The verification code is invalid or has expired.", {
          code: err.code,
          title: err.title,
          status: err.status,
          requestId: err.requestId,
          retryable: err.retryable,
          details: err.details,
          diagnostics: err.diagnostics,
        }));
      } else if (err instanceof ApiError && err.code === "ACTIVE_SESSION_EXISTS") {
        setError(new ApiError("This account is already signed in on another device. Please logout from that device or contact an administrator.", {
          code: err.code,
          title: "Account already signed in",
          status: err.status,
          requestId: err.requestId,
          retryable: false,
          suggestedAction: "Logout from the other device or ask an administrator to revoke the active session.",
          details: err.details,
          diagnostics: err.diagnostics,
        }));
      } else {
        setError(err instanceof Error ? err : new Error("The verification code is invalid or has expired."));
      }
    }
  };

  return (
    <AuthLayout title="Two-factor verification" description="Enter the code from Google Authenticator.">
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <FormError error={error instanceof ApiError ? error : null} message={error instanceof ApiError ? undefined : error?.message} />
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
