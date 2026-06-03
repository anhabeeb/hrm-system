import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/feedback/FormError";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { ApiError } from "@/lib/api-errors";

import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./auth.store";
import { loginSchema } from "./login.schema";
import type { z } from "zod";

type LoginValues = z.infer<typeof loginSchema>;

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    setError(null);
    try {
      const result = await login(values);
      if (result.requires2FA) {
        navigate("/2fa");
        return;
      }
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";
      navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "Unable to sign in. Please try again." });
      }
    }
  };

  return (
    <AuthLayout title="Sign in" description="Use your HRM administrator account to continue.">
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <FormError message={error?.message} requestId={error?.requestId} />
          {(location.state as { message?: string } | null)?.message ? (
            <InlineAlert title={(location.state as { message: string }).message} variant="warning" />
          ) : null}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input autoComplete="email" placeholder="name@company.com" {...field} />
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
