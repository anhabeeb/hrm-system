import type { EmailTemplateDefinition } from "./email-notifications.types";
import { sanitizeActionUrl } from "../notifications/notification-safety";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const stripUnsafeHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");

export const codeEmailTemplates: EmailTemplateDefinition[] = [
  {
    template_key: "leave_request_submitted",
    template_name: "Leave request submitted",
    category: "leave",
    version: "1",
    subject_template: "Leave request awaiting approval",
    text_template: "{{requester_name}} submitted a {{leave_type}} request from {{start_date}} to {{end_date}}. {{action_url}}",
    html_template: "<p><strong>{{requester_name}}</strong> submitted a {{leave_type}} request from {{start_date}} to {{end_date}}.</p><p><a href=\"{{action_url}}\">Review request</a></p>",
  },
  {
    template_key: "leave_request_approved",
    template_name: "Leave approved",
    category: "leave",
    version: "1",
    subject_template: "Your leave request was approved",
    text_template: "Your {{leave_type}} request from {{start_date}} to {{end_date}} was approved.",
    html_template: "<p>Your {{leave_type}} request from {{start_date}} to {{end_date}} was approved.</p>",
  },
  {
    template_key: "leave_request_rejected",
    template_name: "Leave rejected",
    category: "leave",
    version: "1",
    subject_template: "Your leave request was rejected",
    text_template: "Your {{leave_type}} request from {{start_date}} to {{end_date}} was rejected. {{status}}",
    html_template: "<p>Your {{leave_type}} request from {{start_date}} to {{end_date}} was rejected.</p><p>{{status}}</p>",
  },
  {
    template_key: "long_leave_payroll_review_required",
    template_name: "Long leave payroll review required",
    category: "long_leave",
    version: "1",
    subject_template: "Long leave payroll review required",
    text_template: "A long leave payroll impact needs review for {{employee_name}}. {{action_url}}",
    html_template: "<p>A long leave payroll impact needs review for <strong>{{employee_name}}</strong>.</p><p><a href=\"{{action_url}}\">Open long leave</a></p>",
  },
  {
    template_key: "generic_notification",
    template_name: "Generic HRM notification",
    category: "system",
    version: "1",
    subject_template: "{{title}}",
    text_template: "{{message}} {{action_url}}",
    html_template: "<p>{{message}}</p><p><a href=\"{{action_url}}\">Open HRM</a></p>",
  },
];

export const templateForKey = (key?: string | null) =>
  codeEmailTemplates.find((template) => template.template_key === key) ?? null;

export const safeTemplateVariables = (variables?: Record<string, unknown> | null) => {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables ?? {})) {
    if (/password|token|secret|hash|raw_payload|template|image/i.test(key)) continue;
    if (key === "action_url") {
      try {
        safe[key] = sanitizeActionUrl(String(value ?? "")) ?? "";
      } catch {
        safe[key] = "";
      }
      continue;
    }
    safe[key] = String(value ?? "").slice(0, 500);
  }
  return safe;
};

export const renderTemplateString = (template: string, variables: Record<string, string>, html = false) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key] ?? "";
    return html ? escapeHtml(value) : value;
  });

export const renderEmailTemplate = (
  template: EmailTemplateDefinition,
  variables?: Record<string, unknown> | null,
) => {
  const safe = safeTemplateVariables(variables);
  const subject = renderTemplateString(template.subject_template, safe).replace(/\s+/g, " ").trim().slice(0, 180) || "HRM notification";
  const text = renderTemplateString(template.text_template, safe).replace(/\s+$/g, "").trim() || "You have a new HRM notification.";
  const html = template.html_template
    ? stripUnsafeHtml(renderTemplateString(template.html_template, safe, true))
    : null;
  return { subject, text, html, template_key: template.template_key, template_version: template.version };
};
