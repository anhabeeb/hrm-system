import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { DetailSection } from "@/components/data/DetailSection";
import { FormError } from "@/components/feedback/FormError";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-errors";

import { profileApi } from "./profile.api";
import { disableTwoFactorSchema, twoFactorCodeSchema } from "./profile.schema";
import type { SecuritySummary, TwoFactorSetupResponse } from "./profile.types";

export const TwoFactorManagement = ({ security }: { security?: SecuritySummary }) => {
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const codeForm = useForm<z.infer<typeof twoFactorCodeSchema>>({ resolver: zodResolver(twoFactorCodeSchema), defaultValues: { code: "" } });
  const disableForm = useForm<z.infer<typeof disableTwoFactorSchema>>({ resolver: zodResolver(disableTwoFactorSchema), defaultValues: { password: "", code: "" } });

  const startSetup = async () => {
    setError(null);
    try {
      const response = await profileApi.setupTwoFactor();
      setSetupData(response.data);
      setBackupCodes(null);
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: "Two-factor authentication setup could not be started." });
    }
  };

  const verifySetup = async (values: z.infer<typeof twoFactorCodeSchema>) => {
    setError(null);
    try {
      const response = await profileApi.verifyTwoFactor(values.code);
      setBackupCodes(response.data.backup_codes ?? []);
      setSetupData(null);
      codeForm.reset({ code: "" });
      await queryClient.invalidateQueries({ queryKey: ["profile-security"] });
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: "The Google Authenticator code is incorrect." });
    }
  };

  const disable = async (values: z.infer<typeof disableTwoFactorSchema>) => {
    setError(null);
    try {
      await profileApi.disableTwoFactor({ password: values.password, code: values.code });
      setDisableOpen(false);
      disableForm.reset({ password: "", code: "" });
      await queryClient.invalidateQueries({ queryKey: ["profile-security"] });
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: "Two-factor authentication could not be disabled." });
    }
  };

  return (
    <section className="space-y-4">
      <FormError message={error?.message} requestId={error?.requestId} />
      <DetailSection
        title="Two-factor authentication"
        rows={[
          { label: "Status", value: security?.two_factor_enabled ? "Enabled" : "Not enabled" },
          { label: "Guidance", value: "Use Google Authenticator or a compatible TOTP app." },
        ]}
      />
      {security?.two_factor_enabled ? (
        <Button type="button" variant="outline" onClick={() => setDisableOpen(true)}>Disable 2FA</Button>
      ) : (
        <Button type="button" onClick={() => void startSetup()}>Set up 2FA</Button>
      )}

      {setupData ? (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <InlineAlert title="Scan this code with Google Authenticator" variant="info">
            Use the otpauth URI with an authenticator app, then enter the 6-digit code below. The manual setup key is shown only during setup.
          </InlineAlert>
          <div className="rounded-md border bg-muted/30 p-3 text-sm break-all">
            <p className="font-medium">Manual setup key</p>
            <p className="mt-1 font-mono text-xs">{setupData.manual_setup_key}</p>
            <p className="mt-3 font-medium">otpauth URI</p>
            <p className="mt-1 font-mono text-xs">{setupData.otpauth_url}</p>
          </div>
          <Form {...codeForm}>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={codeForm.handleSubmit(verifySetup)}>
              <FormField control={codeForm.control} name="code" render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>Verification code</FormLabel>
                  <FormControl><Input inputMode="numeric" autoComplete="one-time-code" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <LoadingButton type="submit" loading={codeForm.formState.isSubmitting} loadingText="Enabling...">Enable 2FA</LoadingButton>
            </form>
          </Form>
        </div>
      ) : null}

      {backupCodes ? (
        <InlineAlert title="Backup codes generated" variant="success">
          These backup codes are shown once. Store them securely outside this system.
          <div className="mt-3 grid gap-1 font-mono text-xs sm:grid-cols-2">
            {backupCodes.map((code) => <span key={code}>{code}</span>)}
          </div>
        </InlineAlert>
      ) : null}

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>Confirm with your password or a current authenticator code.</DialogDescription>
          </DialogHeader>
          <Form {...disableForm}>
            <form className="space-y-4" onSubmit={disableForm.handleSubmit(disable)}>
              <FormField control={disableForm.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl><PasswordInput autoComplete="current-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={disableForm.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Authenticator code</FormLabel>
                  <FormControl><Input inputMode="numeric" autoComplete="one-time-code" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <LoadingButton type="submit" variant="destructive" loading={disableForm.formState.isSubmitting} loadingText="Disabling...">Disable 2FA</LoadingButton>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </section>
  );
};
