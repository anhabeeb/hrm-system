import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { toastError } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { bootstrapApi } from "@/features/bootstrap/bootstrap.api";

import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./auth.store";
import { loginSchema } from "./login.schema";
import type { z } from "zod";

type LoginValues = z.infer<typeof loginSchema>;

export const LoginPage = () => {
  const { login } = useAuth();
  const toast = useToast();
  const { info, warning } = toast;
  const navigate = useNavigate();
  const location = useLocation();
  const sessionExpiredMessage = new URLSearchParams(location.search).get("reason") === "session_expired"
    ? "Your session expired due to inactivity. Please sign in again."
    : null;
  const stateMessage = (location.state as { message?: string } | null)?.message ?? null;
  const bootstrapStatusQuery = useQuery({
    queryKey: ["bootstrap-status"],
    queryFn: () => bootstrapApi.status(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const rememberMeAllowed = bootstrapStatusQuery.data?.data.remember_me_allowed === true;
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "", remember_me: false },
  });

  useEffect(() => {
    if (sessionExpiredMessage) {
      warning("Session expired", sessionExpiredMessage, { id: "login-session-expired" });
      return;
    }
    if (stateMessage) {
      info("Sign in required", stateMessage, { id: `login-message-${stateMessage}` });
    }
  }, [info, sessionExpiredMessage, stateMessage, warning]);

  const onSubmit = async (values: LoginValues) => {
    try {
      const result = await login({
        ...values,
        identifier: values.identifier.trim(),
        remember_me: rememberMeAllowed && values.remember_me === true,
      });
      if (result.requires2FA) {
        navigate("/2fa");
        return;
      }
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";
      navigate(destination, { replace: true });
    } catch (err) {
      toastError(toast, err, "Unable to sign in. Please try again.");
    }
  };

  return (
    <AuthLayout title="Sign in" description="Use your HRM administrator account to continue.">
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="identifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username or email</FormLabel>
                <FormControl>
                  <Input autoComplete="username" placeholder="Enter your username or email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {rememberMeAllowed ? (
            <FormField
              control={form.control}
              name="remember_me"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3 rounded-md border bg-card p-3">
                  <FormControl>
                    <Checkbox checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked === true)} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Remember me</FormLabel>
                    <p className="text-xs text-muted-foreground">Keep me signed in on this device.</p>
                  </div>
                </FormItem>
              )}
            />
          ) : null}
          <LoadingButton className="w-full" type="submit" loading={form.formState.isSubmitting} loadingText="Signing in...">
            Sign in
          </LoadingButton>
          <div className="text-center text-sm text-muted-foreground">
            <Link className="font-medium text-primary hover:underline" to="/forgot-password">
              Forgot password?
            </Link>
          </div>
        </form>
      </Form>
    </AuthLayout>
  );
};
