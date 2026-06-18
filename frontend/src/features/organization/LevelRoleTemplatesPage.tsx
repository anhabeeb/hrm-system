import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";

import { DataTable } from "@/components/data/DataTable";
import { FilterBar } from "@/components/data/FilterBar";
import { RowActions } from "@/components/data/RowActions";
import { FormError } from "@/components/feedback/FormError";
import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { RequiredLabel } from "@/components/forms/RequiredLabel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth.store";
import { departmentsApi } from "@/features/departments/departments.api";
import { positionsApi } from "@/features/positions/positions.api";
import { rolesApi } from "@/features/roles/roles.api";
import { ApiError } from "@/lib/api-errors";
import { searchParamNumber } from "@/lib/query-string";
import { organizationApi } from "./organization.api";
import type { LevelRoleTemplate, LevelRoleTemplatePayload } from "./organization.types";

const schema = z.object({
  level: z.coerce.number().int().min(1).max(4),
  department_id: z.string().trim().nullable().optional(),
  position_id: z.string().trim().nullable().optional(),
  role_id: z.string().trim().min(1, "Role is required."),
  is_default: z.coerce.boolean().default(true),
  is_required: z.coerce.boolean().default(false),
});

type FormValues = z.infer<typeof schema>;

const defaults: FormValues = {
  level: 1,
  department_id: null,
  position_id: null,
  role_id: "",
  is_default: true,
  is_required: false,
};

const saveError = () => new ApiError("The level role template could not be saved.", { code: "SAVE_FAILED", status: 0 });

export const LevelRoleTemplatesPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<LevelRoleTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mutationError, setMutationError] = useState<ApiError | null>(null);

  const filters = useMemo(() => ({
    level: searchParamNumber(searchParams, "level", 0) || undefined,
    department_id: searchParams.get("department_id") || undefined,
    position_id: searchParams.get("position_id") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const departmentId = form.watch("department_id");

  const templatesQuery = useQuery({ queryKey: ["organization", "level-role-templates", filters], queryFn: () => organizationApi.levelRoleTemplates(filters) });
  const departmentsQuery = useQuery({ queryKey: ["departments", "organization-options"], queryFn: () => departmentsApi.list({ page_size: 100 }) });
  const positionsQuery = useQuery({ queryKey: ["positions", "organization-options"], queryFn: () => positionsApi.list({ page_size: 100 }) });
  const rolesQuery = useQuery({ queryKey: ["roles", "level-role-template-options"], queryFn: () => rolesApi.list({ page_size: 100 }) });

  const positions = positionsQuery.data?.data ?? [];
  const formPositions = positions.filter((position) => !departmentId || position.department_id === departmentId);

  useEffect(() => {
    if (!dialogOpen) return;
    form.reset(selected ? {
      level: selected.level,
      department_id: selected.department_id ?? null,
      position_id: selected.position_id ?? null,
      role_id: selected.role_id,
      is_default: Boolean(selected.is_default ?? true),
      is_required: Boolean(selected.is_required),
    } : defaults);
  }, [dialogOpen, form, selected]);

  useEffect(() => {
    const positionId = form.getValues("position_id");
    if (!departmentId || !positionId) return;
    const position = positions.find((candidate) => candidate.id === positionId);
    if (position && position.department_id !== departmentId) form.setValue("position_id", null);
  }, [departmentId, form, positions]);

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: LevelRoleTemplatePayload }) =>
      id ? organizationApi.updateLevelRoleTemplate(id, payload) : organizationApi.createLevelRoleTemplate(payload),
    onSuccess: async (_, variables) => {
      toastSuccess(toast, variables.id ? "Level role template updated." : "Level role template created.");
      setMutationError(null);
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["organization", "level-role-templates"] });
    },
    onError: (error) => {
      const apiError = error instanceof ApiError ? error : saveError();
      setMutationError(apiError);
      toastError(toast, apiError, "Level role template could not be saved.");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => organizationApi.archiveLevelRoleTemplate(id),
    onSuccess: async () => {
      toastSuccess(toast, "Level role template archived.");
      await queryClient.invalidateQueries({ queryKey: ["organization", "level-role-templates"] });
    },
    onError: (error) => toastError(toast, error, "Level role template could not be archived."),
  });

  const canManage = auth.hasAnyPermission(["organization.levelRoleTemplates.manage"]);
  const setFilterValues = (values: { level?: number; department_id?: string; position_id?: string; page?: number; page_size?: number }) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    if (!("page" in values)) next.set("page", "1");
    setSearchParams(next);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {templatesQuery.isError ? <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Level role templates could not be loaded. Please try again.</div> : null}
      <div className="flex flex-wrap items-center justify-end gap-2" data-setup-target="job-levels">
        {canManage ? <Button onClick={() => { setSelected(null); setMutationError(null); setDialogOpen(true); }}><ShieldCheck className="h-4 w-4" /> Create Template</Button> : null}
      </div>
      <FilterBar searchPlaceholder="Search templates" onSearchChange={() => undefined} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} onApply={() => undefined}>
        <Select value={filters.level ? String(filters.level) : "all"} onValueChange={(value) => setFilterValues({ level: value === "all" ? undefined : Number(value), department_id: filters.department_id, position_id: filters.position_id })}><SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger><SelectContent><SelectItem value="all">All levels</SelectItem><SelectItem value="1">Level 1</SelectItem><SelectItem value="2">Level 2</SelectItem><SelectItem value="3">Level 3</SelectItem><SelectItem value="4">Level 4</SelectItem></SelectContent></Select>
        <Select value={filters.department_id ?? "all"} onValueChange={(value) => setFilterValues({ department_id: value === "all" ? undefined : value, level: filters.level })}><SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem>{(departmentsQuery.data?.data ?? []).map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent></Select>
      </FilterBar>
      <DataTable
        compact
        loading={templatesQuery.isLoading}
        rows={templatesQuery.data?.data ?? []}
        pagination={templatesQuery.data?.pagination}
        onPageChange={(page) => setFilterValues({ page })}
        onPageSizeChange={(page_size) => setFilterValues({ page: 1, page_size })}
        getRowId={(row) => row.id}
        emptyTitle="No level role templates found."
        columns={[
          { key: "level", header: "Level", cell: (row) => `Level ${row.level}` },
          { key: "department", header: "Department override", cell: (row) => row.department_name ?? "Any department" },
          { key: "position", header: "Position override", cell: (row) => row.position_title ?? "Any position" },
          { key: "role", header: "Role", cell: (row) => row.role_name ?? row.role_key ?? row.role_id },
          { key: "default", header: "Default", cell: (row) => row.is_default ? "Yes" : "No" },
          { key: "required", header: "Required", cell: (row) => row.is_required ? "Yes" : "No" },
        ]}
        rowActions={(row) => canManage ? <RowActions actions={[
          { key: "edit", onSelect: () => { setSelected(row); setMutationError(null); setDialogOpen(true); } },
          { key: "archive", label: "Archive", onSelect: () => archiveMutation.mutate(row.id) },
        ]} /> : null}
      />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected ? "Edit Level Role Template" : "Create Level Role Template"}</DialogTitle>
            <DialogDescription>Templates suggest roles for a level, department, or position. They do not remove custom roles.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit((values) => saveMutation.mutate({ id: selected?.id, payload: values }))}>
              <FormError message={mutationError?.message} requestId={mutationError?.requestId} />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField control={form.control} name="level" render={({ field }) => <FormItem><FormLabel><RequiredLabel>Level</RequiredLabel></FormLabel><Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="1">Level 1</SelectItem><SelectItem value="2">Level 2</SelectItem><SelectItem value="3">Level 3</SelectItem><SelectItem value="4">Level 4</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
                <FormField control={form.control} name="role_id" render={({ field }) => <FormItem><FormLabel><RequiredLabel>Role</RequiredLabel></FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl><SelectContent>{(rolesQuery.data?.data ?? []).map((role) => <SelectItem key={role.id} value={role.id}>{role.role_name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
                <FormField control={form.control} name="department_id" render={({ field }) => <FormItem><FormLabel>Department override</FormLabel><Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}><FormControl><SelectTrigger><SelectValue placeholder="Any department" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">Any department</SelectItem>{(departmentsQuery.data?.data ?? []).map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
                <FormField control={form.control} name="position_id" render={({ field }) => <FormItem><FormLabel>Position override</FormLabel><Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}><FormControl><SelectTrigger><SelectValue placeholder="Any position" /></SelectTrigger></FormControl><SelectContent><SelectItem value="none">Any position</SelectItem>{formPositions.map((position) => <SelectItem key={position.id} value={position.id}>{position.title}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
              </div>
              <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                <FormField control={form.control} name="is_default" render={({ field }) => <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} /></FormControl><FormLabel className="text-sm font-normal">Default recommendation</FormLabel></FormItem>} />
                <FormField control={form.control} name="is_required" render={({ field }) => <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(Boolean(checked))} /></FormControl><FormLabel className="text-sm font-normal">Required template role</FormLabel></FormItem>} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <LoadingButton loading={saveMutation.isPending}>{selected ? "Save template" : "Create template"}</LoadingButton>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
