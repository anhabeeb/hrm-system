import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth.store";
import { hasAnyPermission } from "@/lib/permissions";
import { settingsApi } from "../settings.api";
import type { CompanyProfile } from "../settings.types";

const fields: Array<{ key: keyof CompanyProfile; label: string; type?: string }> = [
  { key: "company_name", label: "Company name" },
  { key: "legal_name", label: "Legal name" },
  { key: "registration_number", label: "Registration number" },
  { key: "tax_number", label: "Tax/VAT/TIN number" },
  { key: "company_email", label: "Company email", type: "email" },
  { key: "company_phone", label: "Company phone" },
  { key: "website", label: "Website", type: "url" },
  { key: "country", label: "Country" },
  { key: "timezone", label: "Timezone" },
  { key: "currency", label: "Currency" },
  { key: "address_line_1", label: "Address line 1" },
  { key: "address_line_2", label: "Address line 2" },
  { key: "city", label: "City / island" },
  { key: "state_region", label: "State / region" },
  { key: "postal_code", label: "Postal code" },
  { key: "logo_url", label: "Logo URL", type: "url" },
];

const toForm = (profile?: CompanyProfile): Partial<CompanyProfile> =>
  fields.reduce<Partial<CompanyProfile>>((acc, field) => {
    acc[field.key] = profile?.[field.key] ?? "";
    return acc;
  }, {});

export const CompanyInformationPage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState<Partial<CompanyProfile>>({});
  const canEdit = hasAnyPermission(user, ["company.manage", "settings.manage"]);
  const query = useQuery({ queryKey: ["company", "profile"], queryFn: () => settingsApi.companyProfile() });

  useEffect(() => {
    if (!editing) setForm(toForm(query.data?.data.profile));
  }, [editing, query.data?.data.profile]);

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateCompanyProfile({ ...form, company_email: form.company_email?.toString().toLowerCase() ?? null, reason }),
    onSuccess: () => {
      setEditing(false);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["company", "profile"] });
    },
  });

  return (
    <div>
      <PageHeader title="Company Information" description="View and update company profile details without re-running first-time setup." />
      <div className="space-y-4 p-4 md:p-6">
        {query.isError ? <InlineAlert title="Company information could not be loaded." variant="error" /> : null}
        {mutation.isError ? (
          <InlineAlert title="Company information could not be saved." variant="error">
            {mutation.error instanceof Error ? mutation.error.message : undefined}
          </InlineAlert>
        ) : null}
        {mutation.isSuccess ? <InlineAlert title="Company information updated successfully." variant="success" /> : null}
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold">Company profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">Core fields are stored on the company record; contact and address details are stored as company profile settings.</p>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="outline" onClick={() => { setEditing(false); setReason(""); }} disabled={mutation.isPending}>Cancel</Button>
                <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || reason.trim().length < 3}>Save</Button>
              </>
            ) : (
              <Button onClick={() => setEditing(true)} disabled={!canEdit || query.isLoading}>Edit</Button>
            )}
          </div>
        </div>
        {!canEdit ? (
          <InlineAlert title="View only">
            You need company.manage or settings.manage to edit company information.
          </InlineAlert>
        ) : null}
        <div className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key}>
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                className="mt-1"
                type={field.type ?? "text"}
                disabled={!editing}
                value={String(form[field.key] ?? "")}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            </div>
          ))}
        </div>
        {editing ? (
          <div className="rounded-lg border bg-card p-4">
            <Label htmlFor="company-change-reason">Reason for change</Label>
            <Textarea id="company-change-reason" className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this company information is changing." />
          </div>
        ) : null}
      </div>
    </div>
  );
};
