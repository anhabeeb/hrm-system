import type { EmailProviderMessage, EmailProviderResult } from "./email-notifications.types";
import { ExternalServiceError } from "../../utils/errors";
import { sanitizeFailureMessage } from "../notifications/notification-safety";

export interface EmailProvider {
  sendEmail(message: EmailProviderMessage): Promise<EmailProviderResult>;
  validateConfiguration(): { ok: boolean; reason?: string };
  getProviderName(): string;
  supportsHtml(): boolean;
  supportsAttachments(): boolean;
}

const boolEnv = (value?: string) => ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());

const fromAddress = (env: Env) => env.EMAIL_FROM_ADDRESS ?? "no-reply@example.invalid";
const fromName = (env: Env) => env.EMAIL_FROM_NAME ?? "HRM System";

class DisabledEmailProvider implements EmailProvider {
  constructor(private readonly reason: string, private readonly providerName = "disabled") {}

  getProviderName() {
    return this.providerName;
  }

  supportsHtml() {
    return true;
  }

  supportsAttachments() {
    return false;
  }

  validateConfiguration() {
    return { ok: false, reason: this.reason };
  }

  async sendEmail(): Promise<EmailProviderResult> {
    throw new ExternalServiceError({
      code: "EMAIL_NOT_CONFIGURED",
      message: this.reason,
      technicalMessage: "Email provider is disabled or missing configuration.",
    });
  }
}

class DryRunEmailProvider implements EmailProvider {
  getProviderName() {
    return "dry_run";
  }

  supportsHtml() {
    return true;
  }

  supportsAttachments() {
    return false;
  }

  validateConfiguration() {
    return { ok: true };
  }

  async sendEmail(message: EmailProviderMessage): Promise<EmailProviderResult> {
    return {
      provider: "dry_run",
      providerMessageId: `dryrun:${message.to}:${Date.now()}`,
      dryRun: true,
    };
  }
}

class ResendEmailProvider implements EmailProvider {
  constructor(private readonly env: Env) {}

  getProviderName() {
    return "resend";
  }

  supportsHtml() {
    return true;
  }

  supportsAttachments() {
    return false;
  }

  validateConfiguration() {
    if (!this.env.RESEND_API_KEY) return { ok: false, reason: "RESEND_API_KEY is not configured." };
    if (!this.env.EMAIL_FROM_ADDRESS) return { ok: false, reason: "EMAIL_FROM_ADDRESS is not configured." };
    return { ok: true };
  }

  async sendEmail(message: EmailProviderMessage): Promise<EmailProviderResult> {
    const validation = this.validateConfiguration();
    if (!validation.ok) {
      throw new ExternalServiceError({
        code: "EMAIL_NOT_CONFIGURED",
        message: validation.reason ?? "Email provider is not configured.",
      });
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${message.fromName ?? fromName(this.env)} <${message.from ?? fromAddress(this.env)}>`,
        to: [message.to],
        reply_to: message.replyTo ?? this.env.EMAIL_REPLY_TO ?? undefined,
        subject: message.subject,
        text: message.text,
        html: message.html ?? undefined,
      }),
    });
    if (!response.ok) {
      throw new ExternalServiceError({
        code: "EMAIL_SEND_FAILED",
        message: "Email provider rejected the message.",
        technicalMessage: sanitizeFailureMessage(await response.text().catch(() => response.statusText)),
      });
    }
    const json = await response.json().catch(() => ({})) as { id?: unknown };
    return { provider: "resend", providerMessageId: typeof json.id === "string" ? json.id : null };
  }
}

export const getEmailProvider = (env: Env): EmailProvider => {
  if (!boolEnv(env.EMAIL_NOTIFICATIONS_ENABLED)) {
    return new DisabledEmailProvider("Email notifications are disabled.", "disabled");
  }
  if (boolEnv(env.EMAIL_DRY_RUN)) return new DryRunEmailProvider();
  const provider = String(env.EMAIL_PROVIDER ?? "").toLowerCase();
  if (provider === "resend") return new ResendEmailProvider(env);
  if (!provider) return new DisabledEmailProvider("EMAIL_PROVIDER is not configured.", "missing_config");
  return new DisabledEmailProvider(`Email provider '${provider}' is not supported yet.`, provider);
};

export const getEmailProviderStatus = (env: Env) => {
  const provider = getEmailProvider(env);
  const validation = provider.validateConfiguration();
  return {
    provider: provider.getProviderName(),
    configured: validation.ok,
    status: validation.ok ? "configured" : provider.getProviderName() === "disabled" ? "disabled" : "missing_configuration",
    dry_run: provider.getProviderName() === "dry_run",
    from_address_configured: Boolean(env.EMAIL_FROM_ADDRESS),
    reason: validation.reason ?? null,
  };
};
