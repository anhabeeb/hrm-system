import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth.store";
import { hasAnyPermission } from "@/lib/permissions";
import { settingsApi } from "./settings.api";
import type { SettingsPageDefinition, SettingsSectionDefinition } from "./structured-settings";

type SettingsValue = Record<string, Record<string, unknown>>;

const valueFromSettings = (settings: Array<{ setting_key: string; value: Record<string, unknown> }>, sections: SettingsSectionDefinition[]): SettingsValue => {
  const values: SettingsValue = {};
  for (const section of sections) {
    const existing = settings.find((setting) => setting.setting_key === section.settingKey)?.value ?? {};
    const defaults = Object.fromEntries(
      section.fields
        .filter((field) => field.defaultValue !== undefined)
        .map((field) => [field.key, field.defaultValue]),
    );
    values[section.settingKey] = { ...defaults, ...existing };
  }
  return values;
};

const inputValue = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export const StructuredSettingsPanel = ({ definition }: { definition: SettingsPageDefinition }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [values, setValues] = useState<SettingsValue>({});
  const toast = useToast();
  const canEdit = hasAnyPermission(user, [definition.managePermission, "settings.manage"]);

  const query = useQuery({
    queryKey: ["settings", definition.endpointPath],
    queryFn: () => settingsApi.aliasGroup(definition.endpointPath),
  });
  const featuresQuery = useQuery({
    queryKey: ["settings", "features"],
    queryFn: settingsApi.features,
    enabled: Boolean(definition.parentFeatureKey),
  });
  const loadedValues = useMemo(
    () => valueFromSettings(query.data?.data.settings ?? [], definition.sections),
    [definition.sections, query.data?.data.settings],
  );
  const parentFeature = useMemo(
    () =>
      definition.parentFeatureKey
        ? featuresQuery.data?.data.features.find((feature) => feature.feature_key === definition.parentFeatureKey)
        : undefined,
    [definition.parentFeatureKey, featuresQuery.data?.data.features],
  );
  const parentStateLoading = Boolean(definition.parentFeatureKey && featuresQuery.isLoading);
  const parentDisabled = Boolean(definition.parentFeatureKey && parentFeature && parentFeature.is_enabled !== 1);
  const controlsDisabled = !editing || parentDisabled || parentStateLoading;
  const requiresEffectiveDate = ["attendance", "leave", "long_leave", "payroll", "payroll_earnings", "holidays"].includes(definition.group);

  useEffect(() => {
    if (!editing) setValues(loadedValues);
  }, [editing, loadedValues]);

  useEffect(() => {
    if (parentDisabled && editing) {
      setEditing(false);
      setReason("");
      setEffectiveDate("");
    }
  }, [editing, parentDisabled]);

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateAliasGroup(definition.endpointPath, { settings: values, reason, effective_date: effectiveDate || undefined }),
    onSuccess: () => {
      setEditing(false);
      setReason("");
      setEffectiveDate("");
      toastSuccess(toast, "Settings updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["settings", definition.endpointPath] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => toastError(toast, error, "Settings could not be saved."),
  });

  const setField = (settingKey: string, fieldKey: string, nextValue: unknown) => {
    setValues((current) => ({
      ...current,
      [settingKey]: {
        ...(current[settingKey] ?? {}),
        [fieldKey]: nextValue,
      },
    }));
  };

  if (query.isError) return <InlineAlert title={`${definition.title} settings could not be loaded.`} variant="error" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-base font-semibold">{definition.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{definition.description}</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setReason(""); setEffectiveDate(""); }} disabled={mutation.isPending}>Cancel</Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || parentDisabled || parentStateLoading || reason.trim().length < 3 || (requiresEffectiveDate && !effectiveDate)}>Save changes</Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)} disabled={!canEdit || query.isLoading || parentDisabled || parentStateLoading}>Edit</Button>
          )}
        </div>
      </div>
      {!canEdit ? (
        <InlineAlert title="View only">
          You can view this settings section, but need the manage permission to edit it.
        </InlineAlert>
      ) : null}
      {parentDisabled ? (
        <InlineAlert title={`${definition.parentFeatureLabel ?? definition.title} is disabled`}>
          Enable this module from its Module Availability section before changing sub-feature settings. Existing settings are preserved and will be restored when the module is re-enabled.
        </InlineAlert>
      ) : null}
      {definition.sections.map((section) => (
        <section
          key={`${section.settingKey}-${section.title}`}
          className="relative rounded-lg border bg-card p-4 shadow-sm"
          data-setup-target={section.setupTarget ?? section.setupTargets?.[0]}
        >
          {section.setupTargets?.filter((target) => target !== section.setupTarget).map((target) => (
            <span key={target} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg" data-setup-target={target} />
          ))}
          <div className="mb-4">
            <h3 className="text-sm font-semibold">{section.title}</h3>
            {section.description ? <p className="mt-1 text-sm text-muted-foreground">{section.description}</p> : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {section.fields.map((field) => {
              const rawValue = values[section.settingKey]?.[field.key];
              const id = `${section.settingKey}-${field.key}`;
              return (
                <div key={id} className={field.type === "textarea" ? "md:col-span-2" : undefined}>
                  <Label htmlFor={id}>{field.label}</Label>
                  {field.type === "switch" ? (
                    <div className="mt-2 flex items-center gap-3">
                      <Switch id={id} checked={Boolean(rawValue)} disabled={controlsDisabled} onCheckedChange={(checked) => setField(section.settingKey, field.key, checked)} />
                      <span className="text-sm text-muted-foreground">{Boolean(rawValue) ? "Enabled" : "Disabled"}</span>
                    </div>
                  ) : field.type === "select" ? (
                    <Select disabled={controlsDisabled} value={inputValue(rawValue)} onValueChange={(value) => setField(section.settingKey, field.key, value)}>
                      <SelectTrigger id={id} className="mt-1">
                        <SelectValue placeholder="Choose an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "textarea" ? (
                    <Textarea id={id} className="mt-1" disabled={controlsDisabled} value={inputValue(rawValue)} onChange={(event) => setField(section.settingKey, field.key, event.target.value)} />
                  ) : (
                    <Input
                      id={id}
                      className="mt-1"
                      type={field.type === "number" ? "number" : field.type}
                      disabled={controlsDisabled}
                      value={inputValue(rawValue)}
                      onChange={(event) => setField(section.settingKey, field.key, field.type === "number" ? Number(event.target.value) : event.target.value)}
                    />
                  )}
                  {field.help ? <p className="mt-1 text-xs text-muted-foreground">{field.help}</p> : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {editing ? (
        <div className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor={`${definition.endpointPath}-reason`}>Reason for change</Label>
            <Textarea id={`${definition.endpointPath}-reason`} className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this settings change is needed." />
          </div>
          <div>
            <AppDatePicker clearable={!requiresEffectiveDate} label={requiresEffectiveDate ? "Effective date (required)" : "Effective date"} value={effectiveDate} onChange={(value) => setEffectiveDate(value ?? "")} />
            <p className="mt-1 text-xs text-muted-foreground">
              Choose when this setting should start applying. Existing historical records are not changed automatically.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
};
