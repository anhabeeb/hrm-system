import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
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
    values[section.settingKey] = { ...existing };
  }
  return values;
};

const inputValue = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export const StructuredSettingsPanel = ({ definition }: { definition: SettingsPageDefinition }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<SettingsValue>({});
  const toast = useToast();
  const canEdit = hasAnyPermission(user, [definition.managePermission, "settings.manage"]);

  const query = useQuery({
    queryKey: ["settings", definition.endpointPath],
    queryFn: () => settingsApi.aliasGroup(definition.endpointPath),
  });
  const loadedValues = useMemo(
    () => valueFromSettings(query.data?.data.settings ?? [], definition.sections),
    [definition.sections, query.data?.data.settings],
  );

  useEffect(() => {
    if (!editing) setValues(loadedValues);
  }, [editing, loadedValues]);

  const mutation = useMutation({
    mutationFn: () => settingsApi.updateAliasGroup(definition.endpointPath, { settings: values, reason }),
    onSuccess: () => {
      setEditing(false);
      setReason("");
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
              <Button variant="outline" onClick={() => { setEditing(false); setReason(""); }} disabled={mutation.isPending}>Cancel</Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || reason.trim().length < 3}>Save changes</Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)} disabled={!canEdit || query.isLoading}>Edit</Button>
          )}
        </div>
      </div>
      {!canEdit ? (
        <InlineAlert title="View only">
          You can view this settings section, but need the manage permission to edit it.
        </InlineAlert>
      ) : null}
      {definition.sections.map((section) => (
        <section key={`${section.settingKey}-${section.title}`} className="rounded-lg border bg-card p-4 shadow-sm">
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
                      <Switch id={id} checked={Boolean(rawValue)} disabled={!editing} onCheckedChange={(checked) => setField(section.settingKey, field.key, checked)} />
                      <span className="text-sm text-muted-foreground">{Boolean(rawValue) ? "Enabled" : "Disabled"}</span>
                    </div>
                  ) : field.type === "select" ? (
                    <Select disabled={!editing} value={inputValue(rawValue)} onValueChange={(value) => setField(section.settingKey, field.key, value)}>
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
                    <Textarea id={id} className="mt-1" disabled={!editing} value={inputValue(rawValue)} onChange={(event) => setField(section.settingKey, field.key, event.target.value)} />
                  ) : (
                    <Input
                      id={id}
                      className="mt-1"
                      type={field.type === "number" ? "number" : field.type}
                      disabled={!editing}
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
        <div className="rounded-lg border bg-card p-4">
          <Label htmlFor={`${definition.endpointPath}-reason`}>Reason for change</Label>
          <Textarea id={`${definition.endpointPath}-reason`} className="mt-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this settings change is needed." />
        </div>
      ) : null}
    </div>
  );
};
