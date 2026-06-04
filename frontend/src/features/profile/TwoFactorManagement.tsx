import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
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
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const codeForm = useForm<z.infer<typeof twoFactorCodeSchema>>({ resolver: zodResolver(twoFactorCodeSchema), defaultValues: { code: "" } });
  const disableForm = useForm<z.infer<typeof disableTwoFactorSchema>>({ resolver: zodResolver(disableTwoFactorSchema), defaultValues: { password: "", code: "" } });

  useEffect(() => {
    let cancelled = false;
    if (!setupData?.otpauth_url) {
      setQrCodeDataUrl(null);
      return;
    }

    QRCode.toDataURL(setupData.otpauth_url, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 6,
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrCodeDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrCodeDataUrl(setupData.qr_code_data_url ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [setupData]);

  const startSetup = async () => {
    setError(null);
    try {
      const response = await profileApi.setupTwoFactor();
      setSetupData(response.data);
      setQrCodeDataUrl(response.data.qr_code_data_url ?? null);
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
      setQrCodeDataUrl(null);
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
          { label: "Enabled date", value: security?.verified_at ? new Date(security.verified_at).toLocaleString() : "Not enabled" },
          { label: "Backup codes remaining", value: security?.backup_codes_remaining ?? "Not available" },
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
            Scan this QR code with Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app. Then enter the 6-digit code below.
          </InlineAlert>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="flex items-center justify-center rounded-lg border bg-white p-4">
              {qrCodeDataUrl ? (
                <img className="h-44 w-44 object-contain" src={qrCodeDataUrl} alt="Two-factor authenticator QR code" />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded border text-center text-xs text-muted-foreground">
                  QR code is loading. Use the manual setup key if needed.
                </div>
              )}
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Manual setup key</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="rounded bg-background px-2 py-1 font-mono text-sm tracking-wide">{setupData.manual_key ?? setupData.manual_setup_key}</code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(setupData.manual_setup_key)}
                >
                  Copy key
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                This key is shown only during setup. Store backup codes securely after confirmation.
              </p>
            </div>
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
              <Button type="button" variant="outline" onClick={() => { setSetupData(null); setQrCodeDataUrl(null); codeForm.reset({ code: "" }); }}>Cancel setup</Button>
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
