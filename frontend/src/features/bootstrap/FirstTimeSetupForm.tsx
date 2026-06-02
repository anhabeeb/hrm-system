import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import type { z } from "zod";

import { FormError } from "@/components/feedback/FormError";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { PasswordStrengthHint } from "@/components/forms/PasswordStrengthHint";
import { RequiredLabel } from "@/components/forms/RequiredLabel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ApiError } from "@/lib/api-errors";

import { bootstrapApi } from "./bootstrap.api";
import { setupSchema } from "./setup.schema";
import type { BootstrapInitializePayload } from "./setup.types";

type SetupValues = z.infer<typeof setupSchema>;

const defaults: SetupValues = {
  company_name: "",
  legal_name: "",
  registration_number: "",
  country: "MV",
  timezone: "Indian/Maldives",
  currency: "MVR",
  full_name: "",
  email: "",
  password: "",
  confirm_password: "",
  include_outlet: true,
  outlet_name: "",
  outlet_code: "",
  is_primary: true,
  bootstrap_token: "",
};

const toPayload = (values: SetupValues): BootstrapInitializePayload => ({
  company: {
    company_name: values.company_name,
    legal_name: values.legal_name || null,
    registration_number: values.registration_number || null,
    country: values.country,
    timezone: values.timezone,
    currency: values.currency,
  },
  super_admin: {
    full_name: values.full_name,
    email: values.email,
    password: values.password,
  },
  outlet: values.include_outlet
    ? {
        outlet_name: values.outlet_name ?? "",
        outlet_code: values.outlet_code || null,
        is_primary: values.is_primary,
      }
    : undefined,
});

export const FirstTimeSetupForm = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: defaults,
  });
  const password = form.watch("password");
  const includeOutlet = form.watch("include_outlet");

  const onSubmit = async (values: SetupValues) => {
    setError(null);
    try {
      await bootstrapApi.initialize(toPayload(values), values.bootstrap_token);
      queryClient.setQueryData(["bootstrap-status"], {
        success: true,
        data: { setup_required: false },
        message: "Initial setup has already been completed.",
      });
      setSuccess(true);
      form.reset(defaults);
      window.setTimeout(() => navigate("/login", { replace: true, state: { message: "Initial setup completed. Please log in." } }), 900);
    } catch (err) {
      if (err instanceof ApiError) {
        const message =
          err.code === "BOOTSTRAP_ALREADY_COMPLETED"
            ? "Initial setup has already been completed."
            : err.code === "BOOTSTRAP_TOKEN_INVALID"
              ? "Bootstrap token is invalid."
              : err.code === "BOOTSTRAP_ROLE_MISSING"
                ? "Super Admin role is missing. Please run the seed files first."
                : err.status === 422
                  ? "The setup could not be completed. Please review the form and try again."
                  : err.message;
        setError({ message, requestId: err.requestId });
      } else {
        setError({ message: "The setup could not be completed. Please review the form and try again." });
      }
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        {success ? <InlineAlert title="Initial setup completed successfully." variant="success">Redirecting to login...</InlineAlert> : null}
        <FormError message={error?.message} requestId={error?.requestId} />

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Company Information</h2>
            <p className="text-sm text-muted-foreground">These defaults can be refined later in Settings.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField control={form.control} name="company_name" render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Company name</RequiredLabel></FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="legal_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Legal name</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="registration_number" render={({ field }) => (
              <FormItem>
                <FormLabel>Registration number</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="country" render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="timezone" render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="currency" render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">First Super Admin</h2>
            <p className="text-sm text-muted-foreground">This account will manage the system after setup.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField control={form.control} name="full_name" render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Full name</RequiredLabel></FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Email</RequiredLabel></FormLabel>
                <FormControl><Input autoComplete="email" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Password</RequiredLabel></FormLabel>
                <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
                <FormDescription>Use a strong password. It is never stored in the browser.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirm_password" render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Confirm password</RequiredLabel></FormLabel>
                <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <PasswordStrengthHint password={password} />
        </section>

        <Separator />

        <section className="space-y-4">
          <FormField control={form.control} name="include_outlet" render={({ field }) => (
            <FormItem className="flex items-start gap-3 space-y-0">
              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              <div>
                <FormLabel>Create first outlet</FormLabel>
                <FormDescription>Add the first operational outlet during setup.</FormDescription>
              </div>
            </FormItem>
          )} />
          {includeOutlet ? (
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="outlet_name" render={({ field }) => (
                <FormItem>
                  <FormLabel><RequiredLabel>Outlet name</RequiredLabel></FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="outlet_code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Outlet code</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          ) : null}
        </section>

        <Separator />

        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Bootstrap Token</h2>
            <p className="text-sm text-muted-foreground">The token is sent once as an Authorization header and is never stored.</p>
          </div>
          <FormField control={form.control} name="bootstrap_token" render={({ field }) => (
            <FormItem>
              <FormLabel><RequiredLabel>Bootstrap token</RequiredLabel></FormLabel>
              <FormControl><PasswordInput autoComplete="off" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </section>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => form.reset(defaults)}>
            Clear
          </Button>
          <LoadingButton type="submit" loading={form.formState.isSubmitting} loadingText="Completing setup...">
            Complete setup
          </LoadingButton>
        </div>
      </form>
    </Form>
  );
};
